import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CertsService } from './certs.service';

export interface HeartbeatPayload {
  agentVersion: string;
  cpuCores: number;
  memoryMb: number;
  metrics: {
    cpuPercent: number;
    memUsedMb: number;
    diskUsedGb: Record<string, number>;
  };
  vms: { name: string; state: 'running' | 'stopped' | 'paused' }[];
}

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly certs: CertsService,
    private readonly events: EventsGateway,
  ) {}

  list() {
    return this.prisma.node.findMany({
      include: { _count: { select: { vms: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const node = await this.prisma.node.findUnique({
      where: { id },
      include: { vms: { select: { id: true, name: true, state: true, vcpus: true, memoryMb: true } }, storagePools: true },
    });
    if (!node) throw new NotFoundException('Node nicht gefunden');
    return node;
  }

  async createJoinToken(nodeName: string) {
    if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(nodeName)) {
      throw new BadRequestException('Ungültiger Node-Name');
    }
    const token = randomBytes(32).toString('base64url');
    await this.prisma.joinToken.create({
      data: {
        tokenHash: this.hash(token),
        nodeName,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    return { token, nodeName, expiresInMinutes: 15 };
  }

  async join(params: {
    token: string;
    csr: string; // base64 PEM
    fingerprint: string;
    hostname: string;
    agentPort: number;
    sourceIp: string;
  }) {
    const joinToken = await this.prisma.joinToken.findUnique({
      where: { tokenHash: this.hash(params.token) },
    });
    if (!joinToken || joinToken.usedAt || joinToken.expiresAt < new Date()) {
      throw new BadRequestException('Join-Token ungültig oder abgelaufen');
    }

    const csrPem = Buffer.from(params.csr, 'base64').toString('utf8');
    if (!csrPem.includes('BEGIN CERTIFICATE REQUEST')) {
      throw new BadRequestException('Ungültige CSR');
    }
    const { certPem, caPem, spkiPin } = await this.certs.signCsr(csrPem);

    const node = await this.prisma.$transaction(async (tx) => {
      await tx.joinToken.update({
        where: { id: joinToken.id },
        data: { usedAt: new Date() },
      });
      const created = await tx.node.create({
        data: {
          name: joinToken.nodeName,
          hostname: params.hostname,
          agentAddress: `${params.sourceIp}:${params.agentPort}`,
          certSpkiPin: spkiPin,
          fingerprint: params.fingerprint,
          state: 'joining',
        },
      });
      // Default-Storage-Pool des Agents (lokales Images-Verzeichnis)
      await tx.storagePool.create({
        data: {
          name: 'local',
          type: 'dir',
          nodeId: created.id,
          path: '/var/lib/vcp/images',
          isDefault: true,
        },
      });
      return created;
    });

    return {
      nodeId: node.id,
      certificate: Buffer.from(certPem).toString('base64'),
      caCertificate: Buffer.from(caPem).toString('base64'),
    };
  }

  async heartbeat(nodeId: string, payload: HeartbeatPayload) {
    const vmsRunning = payload.vms.filter((v) => v.state === 'running').length;

    const node = await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        state: 'online',
        lastHeartbeatAt: new Date(),
        agentVersion: payload.agentVersion,
        cpuCores: payload.cpuCores,
        memoryMb: payload.memoryMb,
        cpuUsage: payload.metrics.cpuPercent,
        memUsedMb: payload.metrics.memUsedMb,
      },
    });

    await this.prisma.nodeMetricSample.create({
      data: {
        nodeId,
        cpuPercent: payload.metrics.cpuPercent,
        memUsedMb: payload.metrics.memUsedMb,
        vmsRunning,
      },
    });

    for (const vm of payload.vms) {
      const updated = await this.prisma.vm.updateMany({
        where: { name: vm.name, nodeId, state: { in: ['running', 'stopped', 'paused'] } },
        data: { state: vm.state },
      });
      if (updated.count > 0) this.events.emitVmState(vm.name, vm.state);
    }

    this.events.emitNodeState(node.id, 'online', payload.metrics);
    return { ok: true };
  }

  async getMetrics(nodeId: string, hours = 1) {
    const since = new Date(Date.now() - hours * 3_600_000);
    return this.prisma.nodeMetricSample.findMany({
      where: { nodeId, sampledAt: { gte: since } },
      orderBy: { sampledAt: 'asc' },
      select: { sampledAt: true, cpuPercent: true, memUsedMb: true, vmsRunning: true },
    });
  }

  /** Metrik-Samples älter als 7 Tage täglich bereinigen. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async pruneOldMetrics() {
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    await this.prisma.nodeMetricSample.deleteMany({ where: { sampledAt: { lt: cutoff } } });
  }

  async setMaintenance(id: string, maintenance: boolean) {
    return this.prisma.node.update({
      where: { id },
      data: { state: maintenance ? 'maintenance' : 'online' },
    });
  }

  // ─── Storage Pools ─────────────────────────────────────────────────────────

  async createStoragePool(nodeId: string, dto: {
    name: string; type: 'dir' | 'zfs' | 'nfs' | 'iscsi'; path: string; isDefault?: boolean;
  }) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Node nicht gefunden');
    if (dto.isDefault) {
      await this.prisma.storagePool.updateMany({ where: { nodeId }, data: { isDefault: false } });
    }
    return this.prisma.storagePool.create({ data: { nodeId, ...dto, isDefault: dto.isDefault ?? false } });
  }

  async setDefaultPool(nodeId: string, poolId: string) {
    await this.prisma.storagePool.updateMany({ where: { nodeId }, data: { isDefault: false } });
    return this.prisma.storagePool.update({ where: { id: poolId }, data: { isDefault: true } });
  }

  async removeStoragePool(nodeId: string, poolId: string) {
    const pool = await this.prisma.storagePool.findFirst({ where: { id: poolId, nodeId } });
    if (!pool) throw new NotFoundException('Storage-Pool nicht gefunden');
    const volumes = await this.prisma.volume.count({ where: { storagePoolId: poolId } });
    if (volumes > 0) throw new BadRequestException('Pool hat noch Volumes');
    await this.prisma.storagePool.delete({ where: { id: poolId } });
  }

  async remove(id: string) {
    const count = await this.prisma.vm.count({ where: { nodeId: id } });
    if (count > 0) throw new BadRequestException('Node hat noch VMs');
    await this.prisma.node.delete({ where: { id } });
    return { ok: true };
  }

  /** Nodes ohne Heartbeat seit 60s als offline markieren. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async markStaleNodesOffline() {
    const cutoff = new Date(Date.now() - 60_000);
    const stale = await this.prisma.node.updateMany({
      where: { state: 'online', lastHeartbeatAt: { lt: cutoff } },
      data: { state: 'offline' },
    });
    if (stale.count > 0) this.events.emitNodeState('*', 'offline', null);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
