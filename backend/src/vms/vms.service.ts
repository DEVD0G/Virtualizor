import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AgentClientService, VmCreateSpec } from '../agent/agent-client.service';
import { TasksService, TaskHandler, TaskKind } from '../tasks/tasks.service';
import { EventsGateway } from '../events/events.gateway';
import { LicenseService } from '../license/license.service';
import { QuotasService } from '../quotas/quotas.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AuthenticatedUser } from '../auth/auth.service';
import { CreateVmDto } from './dto/create-vm.dto';

export interface ConsoleMeta {
  agentAddress: string;
  vmName: string;
}

const vmInclude = {
  node: { select: { id: true, name: true, agentAddress: true } },
  owner: { select: { id: true, email: true, name: true } },
  disks: { include: { storagePool: { select: { id: true, name: true, type: true } } } },
  nics: { include: { network: true, ips: true } },
  mountedIso: { select: { id: true, name: true } },
} satisfies Prisma.VmInclude;

@Injectable()
export class VmsService implements TaskHandler, OnModuleInit {
  private readonly logger = new Logger(VmsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentClientService,
    private readonly tasks: TasksService,
    private readonly events: EventsGateway,
    private readonly license: LicenseService,
    private readonly quotas: QuotasService,
    private readonly webhooks: WebhooksService,
  ) {
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.redis = new Redis({ host: url.hostname, port: parseInt(url.port || '6379', 10) });
  }

  onModuleInit() {
    this.tasks.registerHandler(this);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  list(user: AuthenticatedUser, filter: { nodeId?: string; state?: string }) {
    return this.prisma.vm.findMany({
      where: {
        ...(this.isAdminScope(user) ? {} : { ownerId: user.id }),
        ...(filter.nodeId ? { nodeId: filter.nodeId } : {}),
        ...(filter.state ? { state: filter.state as any } : {}),
      },
      include: vmInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthenticatedUser, id: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id }, include: vmInclude });
    if (!vm) throw new NotFoundException('VM nicht gefunden');
    if (!this.isAdminScope(user) && vm.ownerId !== user.id) throw new ForbiddenException();
    return vm;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async create(user: AuthenticatedUser, dto: CreateVmDto) {
    await this.license.assertWriteAllowed();
    await this.license.assertVmLimit();
    const totalDiskGb = dto.disks.reduce((s, d) => s + d.sizeGb, 0);
    await this.quotas.checkVmCreateQuota(user, dto.vcpus, dto.memoryMb, totalDiskGb);

    const exists = await this.prisma.vm.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('VM-Name bereits vergeben');

    const node = await this.pickNode(dto);
    const ownerId = dto.ownerId && this.isAdminScope(user) ? dto.ownerId : user.id;

    const vm = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vm.create({
        data: {
          name: dto.name,
          vcpus: dto.vcpus,
          memoryMb: dto.memoryMb,
          bios: dto.uefi ? 'ovmf' : 'seabios',
          cpuSockets: dto.cpuSockets ?? 1,
          cpuCores: dto.cpuCores ?? dto.vcpus,
          cpuThreads: dto.cpuThreads ?? 1,
          bootOrder: dto.bootOrder ?? [],
          nodeId: node.id,
          ownerId,
          templateId: dto.templateId,
          cloudInit: dto.cloudInit as Prisma.InputJsonValue,
          tags: dto.tags ?? [],
          description: dto.description,
        },
      });

      for (const [i, disk] of dto.disks.entries()) {
        const pool = disk.storagePoolId
          ? await tx.storagePool.findFirstOrThrow({ where: { id: disk.storagePoolId, nodeId: node.id } })
          : await tx.storagePool.findFirstOrThrow({ where: { nodeId: node.id, isDefault: true } });
        await tx.volume.create({
          data: {
            name: `${dto.name}-disk${i}`,
            sizeGb: disk.sizeGb,
            vmId: created.id,
            storagePoolId: pool.id,
            bootOrder: i,
          },
        });
      }

      for (const nicSpec of dto.nics) {
        const nic = await tx.nic.create({
          data: { vmId: created.id, networkId: nicSpec.networkId, mac: this.generateMac() },
        });
        if (nicSpec.ipPoolId) {
          // Erste freie IP transaktional reservieren (Row-Lock via updateMany-Pattern)
          const ip = await tx.ipAddress.findFirst({
            where: { poolId: nicSpec.ipPoolId, nicId: null, reserved: false },
            orderBy: { address: 'asc' },
          });
          if (!ip) throw new BadRequestException('Keine freie IP im Pool');
          const claimed = await tx.ipAddress.updateMany({
            where: { id: ip.id, nicId: null },
            data: { nicId: nic.id },
          });
          if (claimed.count === 0) throw new ConflictException('IP-Zuweisung kollidiert, bitte erneut versuchen');
        }
      }

      return created;
    });

    const task = await this.tasks.enqueue('vm.provision', 'vm', vm.id, { vmId: vm.id }, user.id);
    return { vm, taskId: task.id };
  }

  async power(user: AuthenticatedUser, id: string, action: 'start' | 'stop' | 'restart', force = false) {
    const vm = await this.get(user, id);
    const kind = `vm.${action}` as TaskKind;
    const task = await this.tasks.enqueue(kind, 'vm', vm.id, { vmId: vm.id, force }, user.id);
    return { taskId: task.id };
  }

  async updateMeta(user: AuthenticatedUser, id: string, dto: { description?: string; tags?: string[] }) {
    const vm = await this.get(user, id);
    return this.prisma.vm.update({
      where: { id: vm.id },
      data: { ...(dto.description !== undefined ? { description: dto.description } : {}),
               ...(dto.tags !== undefined ? { tags: dto.tags } : {}) },
    });
  }

  async clone(user: AuthenticatedUser, id: string, newName: string) {
    await this.license.assertWriteAllowed();
    const source = await this.get(user, id);
    if (source.state !== 'stopped') throw new BadRequestException('Quelle muss gestoppt sein');

    const exists = await this.prisma.vm.findUnique({ where: { name: newName } });
    if (exists) throw new ConflictException('VM-Name bereits vergeben');

    const clone = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vm.create({
        data: {
          name: newName,
          vcpus: source.vcpus,
          memoryMb: source.memoryMb,
          nodeId: source.nodeId,
          ownerId: user.id,
          templateId: source.templateId,
          cloudInit: source.cloudInit as any,
          tags: (source as any).tags ?? [],
          description: `Klon von ${source.name}`,
        },
      });
      // Disks mit gleichen Größen + Pool anlegen (Agent klont die Daten)
      for (const [i, disk] of (source as any).disks.entries()) {
        await tx.volume.create({
          data: {
            name: `${newName}-disk${i}`,
            sizeGb: disk.sizeGb,
            vmId: created.id,
            storagePoolId: disk.storagePoolId,
            bootOrder: disk.bootOrder,
          },
        });
      }
      return created;
    });

    const task = await this.tasks.enqueue('vm.clone', 'vm', clone.id,
      { sourceVmId: source.id, cloneVmId: clone.id }, user.id);
    return { vm: clone, taskId: task.id };
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.license.assertWriteAllowed();
    const vm = await this.get(user, id);
    await this.prisma.vm.update({ where: { id: vm.id }, data: { state: 'deleting' } });
    const task = await this.tasks.enqueue('vm.delete', 'vm', vm.id, { vmId: vm.id }, user.id);
    return { taskId: task.id };
  }

  // ─── Migrate ───────────────────────────────────────────────────────────────

  async migrate(user: AuthenticatedUser, id: string, targetNodeId: string) {
    const vm = await this.get(user, id);
    if (vm.state !== 'stopped') throw new BadRequestException('VM muss gestoppt sein');
    const targetNode = await this.prisma.node.findFirst({ where: { id: targetNodeId, state: 'online' } });
    if (!targetNode) throw new BadRequestException('Ziel-Node nicht verfügbar');
    if (targetNode.id === vm.nodeId) throw new BadRequestException('VM befindet sich bereits auf diesem Node');
    const task = await this.tasks.enqueue('vm.migrate', 'vm', vm.id,
      { vmId: vm.id, targetNodeId }, user.id);
    return { taskId: task.id };
  }

  // ─── ISO Mount ─────────────────────────────────────────────────────────────

  async mountIso(user: AuthenticatedUser, vmId: string, isoId: string) {
    const vm = await this.get(user, vmId);
    const iso = await this.prisma.iso.findUnique({ where: { id: isoId } });
    if (!iso) throw new NotFoundException('ISO nicht gefunden');
    await this.agent.mountIso(vm.node as any, vm.name, iso.sourceUrl);
    return this.prisma.vm.update({ where: { id: vm.id }, data: { mountedIsoId: isoId } });
  }

  async unmountIso(user: AuthenticatedUser, vmId: string) {
    const vm = await this.get(user, vmId);
    if (!(vm as any).mountedIsoId) throw new BadRequestException('Kein ISO eingehängt');
    await this.agent.unmountIso(vm.node as any, vm.name);
    return this.prisma.vm.update({ where: { id: vm.id }, data: { mountedIsoId: null } });
  }

  // ─── Resize ────────────────────────────────────────────────────────────────

  async resize(user: AuthenticatedUser, id: string, dto: { vcpus?: number; memoryMb?: number }) {
    const vm = await this.get(user, id);
    if (vm.state !== 'stopped') throw new BadRequestException('VM muss gestoppt sein');
    const vcpus = dto.vcpus ?? vm.vcpus;
    const memoryMb = dto.memoryMb ?? vm.memoryMb;
    await this.prisma.vm.update({ where: { id: vm.id }, data: { vcpus, memoryMb } });
    const task = await this.tasks.enqueue('vm.resize', 'vm', vm.id,
      { vmId: vm.id, vcpus, memoryMb }, user.id);
    return { taskId: task.id };
  }

  async resizeDisk(user: AuthenticatedUser, vmId: string, diskId: string, newSizeGb: number) {
    const vm = await this.get(user, vmId);
    if (vm.state !== 'stopped') throw new BadRequestException('VM muss gestoppt sein');
    const disk = vm.disks.find((d) => d.id === diskId);
    if (!disk) throw new NotFoundException('Disk nicht gefunden');
    if (newSizeGb <= disk.sizeGb) throw new BadRequestException('Neue Größe muss größer als aktuell sein');
    await this.prisma.volume.update({ where: { id: diskId }, data: { sizeGb: newSizeGb } });
    const task = await this.tasks.enqueue('vm.disk-resize', 'vm', vm.id,
      { vmId: vm.id, diskId, newSizeGb }, user.id);
    return { taskId: task.id };
  }

  // ─── Snapshots ─────────────────────────────────────────────────────────────

  async createSnapshot(user: AuthenticatedUser, vmId: string, name: string, description?: string) {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(name)) throw new BadRequestException('Ungültiger Snapshot-Name');
    const vm = await this.get(user, vmId);
    const snapshot = await this.prisma.vmSnapshot.create({
      data: { vmId: vm.id, name, description },
    });
    const task = await this.tasks.enqueue('vm.snapshot', 'vm', vm.id,
      { vmId: vm.id, snapshotName: name }, user.id);
    return { snapshot, taskId: task.id };
  }

  async listSnapshots(user: AuthenticatedUser, vmId: string) {
    await this.get(user, vmId);
    return this.prisma.vmSnapshot.findMany({ where: { vmId }, orderBy: { createdAt: 'desc' } });
  }

  async revertSnapshot(user: AuthenticatedUser, vmId: string, snapshotId: string) {
    const vm = await this.get(user, vmId);
    const snap = await this.prisma.vmSnapshot.findFirstOrThrow({ where: { id: snapshotId, vmId } });
    const task = await this.tasks.enqueue('vm.snapshot-revert', 'vm', vm.id,
      { vmId: vm.id, snapshotName: snap.name }, user.id);
    return { taskId: task.id };
  }

  async deleteSnapshot(user: AuthenticatedUser, vmId: string, snapshotId: string) {
    const vm = await this.get(user, vmId);
    const snap = await this.prisma.vmSnapshot.findFirstOrThrow({ where: { id: snapshotId, vmId } });
    const task = await this.tasks.enqueue('vm.snapshot-delete', 'vm', vm.id,
      { vmId: vm.id, snapshotName: snap.name, snapshotId: snap.id }, user.id);
    return { taskId: task.id };
  }

  // ─── Firewall ──────────────────────────────────────────────────────────────

  async listFirewallRules(user: AuthenticatedUser, vmId: string) {
    await this.get(user, vmId);
    return this.prisma.firewallRule.findMany({
      where: { vmId },
      orderBy: [{ direction: 'asc' }, { priority: 'asc' }],
    });
  }

  async createFirewallRule(user: AuthenticatedUser, vmId: string, dto: {
    direction: 'in' | 'out';
    action: 'accept' | 'drop';
    protocol: string;
    portFrom?: number;
    portTo?: number;
    cidr?: string;
    priority?: number;
  }) {
    const vm = await this.get(user, vmId);
    const rule = await this.prisma.firewallRule.create({
      data: {
        vmId: vm.id,
        direction: dto.direction,
        action: dto.action,
        protocol: dto.protocol,
        portFrom: dto.portFrom ?? null,
        portTo: dto.portTo ?? null,
        cidr: dto.cidr ?? '0.0.0.0/0',
        priority: dto.priority ?? 100,
      },
    });
    await this.applyFirewallRules(vm.id).catch((e) =>
      this.logger.warn(`Firewall-Apply nach Erstellen fehlgeschlagen: ${e.message}`));
    return rule;
  }

  async deleteFirewallRule(user: AuthenticatedUser, vmId: string, ruleId: string) {
    const vm = await this.get(user, vmId);
    await this.prisma.firewallRule.deleteMany({ where: { id: ruleId, vmId } });
    await this.applyFirewallRules(vm.id).catch((e) =>
      this.logger.warn(`Firewall-Apply nach Löschen fehlgeschlagen: ${e.message}`));
  }

  private async applyFirewallRules(vmId: string) {
    const vm = await this.prisma.vm.findUnique({
      where: { id: vmId },
      include: { nics: true, firewallRules: { orderBy: { priority: 'asc' } } },
    });
    if (!vm || vm.state !== 'running') return;
    const node = await this.prisma.node.findUniqueOrThrow({ where: { id: vm.nodeId } });
    await this.agent.applyFirewall(node, vm.name, vm.firewallRules as object[]);
  }

  async consoleToken(user: AuthenticatedUser, vmId: string) {
    const vm = await this.get(user, vmId);
    const node = await this.prisma.node.findUniqueOrThrow({ where: { id: vm.nodeId } });
    const { token, expiresIn } = await this.agent.consoleToken(node, vm.name);
    const meta: ConsoleMeta = { agentAddress: node.agentAddress, vmName: vm.name };
    await this.redis.set(`console:${token}`, JSON.stringify(meta), 'EX', expiresIn + 30);
    return { token, expiresIn, wsUrl: `/api/v1/vms/${vmId}/console/ws` };
  }

  async resolveConsoleToken(token: string): Promise<ConsoleMeta | null> {
    const raw = await this.redis.get(`console:${token}`);
    if (!raw) return null;
    return JSON.parse(raw) as ConsoleMeta;
  }

  // ─── Task-Handler (BullMQ-Worker) ──────────────────────────────────────────

  async handle(kind: TaskKind, payload: Record<string, any>, onProgress: (p: number) => void) {
    const vm = await this.prisma.vm.findUnique({
      where: { id: payload.vmId },
      include: { ...vmInclude, template: true },
    });
    if (!vm) return; // VM bereits weg → Task ist no-op (idempotent)
    const node = await this.prisma.node.findUniqueOrThrow({ where: { id: vm.nodeId } });

    switch (kind) {
      case 'vm.provision': {
        onProgress(10);
        const pciPassthroughs = await this.prisma.pciPassthrough.findMany({ where: { vmId: vm.id } });
        const spec: VmCreateSpec = {
          name: vm.name,
          vcpus: vm.vcpus,
          memoryMb: vm.memoryMb,
          uefi: (vm as any).bios === 'ovmf',
          cpuSockets: (vm as any).cpuSockets,
          cpuCores: (vm as any).cpuCores,
          cpuThreads: (vm as any).cpuThreads,
          bootOrder: (vm as any).bootOrder,
          pciDevices: pciPassthroughs.map((p) => ({
            domain: p.domain, bus: p.bus, slot: p.slot, function: p.function,
          })),
          disks: vm.disks.map((d) => ({
            name: d.name,
            sizeGb: d.sizeGb,
            poolPath: d.storagePool.name,
            templateUrl: d.bootOrder === 0 ? vm.template?.sourceUrl : undefined,
            templateSha256: d.bootOrder === 0 ? vm.template?.sha256 : undefined,
          })),
          nics: vm.nics.map((n) => ({
            mac: n.mac,
            bridge: n.network.bridge,
            vlanTag: n.network.vlanTag ?? undefined,
            ip: n.ips[0]?.address,
          })),
          cloudInit: { ...(vm.cloudInit as any), hostname: vm.name },
        };
        await this.agent.createVm(node, spec);
        onProgress(90);
        await this.setState(vm.id, vm.name, 'running');
        break;
      }
      case 'vm.start':
        await this.agent.startVm(node, vm.name);
        await this.setState(vm.id, vm.name, 'running');
        break;
      case 'vm.stop':
        await this.agent.stopVm(node, vm.name, Boolean(payload.force));
        await this.setState(vm.id, vm.name, 'stopped');
        break;
      case 'vm.restart':
        await this.agent.restartVm(node, vm.name);
        await this.setState(vm.id, vm.name, 'running');
        break;
      case 'vm.clone': {
        const sourceVm = await this.prisma.vm.findUniqueOrThrow({
          where: { id: payload.sourceVmId },
          include: { node: true },
        });
        await this.agent.cloneVm(node, sourceVm.name, vm.name);
        await this.setState(vm.id, vm.name, 'stopped');
        break;
      }
      case 'vm.migrate': {
        const targetNode = await this.prisma.node.findUniqueOrThrow({ where: { id: payload.targetNodeId } });
        onProgress(10);
        await this.agent.migrateVm(node, vm.name, targetNode.agentAddress);
        await this.prisma.vm.update({ where: { id: vm.id }, data: { nodeId: targetNode.id } });
        await this.setState(vm.id, vm.name, 'stopped');
        break;
      }
      case 'vm.delete':
        await this.agent.deleteVm(node, vm.name);
        await this.prisma.vm.delete({ where: { id: vm.id } });
        this.events.emitVmState(vm.name, 'deleted');
        break;
      case 'vm.snapshot':
        await this.agent.snapshotVm(node, vm.name, payload.snapshotName);
        break;
      case 'vm.snapshot-revert':
        await this.agent.revertSnapshot(node, vm.name, payload.snapshotName);
        break;
      case 'vm.snapshot-delete':
        await this.agent.deleteSnapshot(node, vm.name, payload.snapshotName);
        await this.prisma.vmSnapshot.deleteMany({ where: { id: payload.snapshotId } });
        break;
      case 'vm.backup': {
        onProgress(5);
        const result = await this.agent.backupVm(node, vm.name, payload.targetDir);
        const totalBytes = BigInt(result.totalBytes ?? 0);
        await this.prisma.backup.update({
          where: { id: payload.backupId },
          data: { state: 'completed', sizeBytes: totalBytes, target: result.targetDir },
        });
        break;
      }
      case 'vm.restore': {
        onProgress(5);
        const backupFiles: string[] = payload.backupFiles ?? (payload.backupPath ? [payload.backupPath] : []);
        await this.agent.restoreVm(node, vm.name, backupFiles);
        if (payload.backupId) {
          await this.prisma.backup.update({
            where: { id: payload.backupId },
            data: { state: 'completed' },
          });
        }
        break;
      }
      case 'vm.resize':
        await this.agent.resizeVm(node, vm.name, payload.vcpus, payload.memoryMb);
        break;
      case 'vm.disk-resize': {
        const disk = await this.prisma.volume.findUnique({ where: { id: payload.diskId } });
        if (!disk) break;
        // Determine the actual path on the agent: storagePool.path + disk.name + ".qcow2"
        const pool = await this.prisma.storagePool.findUnique({ where: { id: disk.storagePoolId } });
        if (!pool) break;
        const diskPath = `${pool.path}/${disk.name}.qcow2`;
        await this.agent.resizeDisk(node, vm.name, diskPath, payload.newSizeGb);
        break;
      }
    }
  }

  // ─── Intern ────────────────────────────────────────────────────────────────

  /** Placement: expliziter Node oder least-allocated (RAM-gewichtet). */
  private async pickNode(dto: CreateVmDto) {
    if (dto.nodeId) {
      const node = await this.prisma.node.findFirst({
        where: { id: dto.nodeId, state: 'online' },
      });
      if (!node) throw new BadRequestException('Node nicht verfügbar');
      return node;
    }
    const nodes = await this.prisma.node.findMany({
      where: { state: 'online' },
      include: { vms: { select: { memoryMb: true } } },
    });
    const candidates = nodes
      .map((n) => ({
        node: n,
        freeMb: n.memoryMb * n.memOvercommit - n.vms.reduce((s, v) => s + v.memoryMb, 0),
      }))
      .filter((c) => c.freeMb >= dto.memoryMb)
      .sort((a, b) => b.freeMb - a.freeMb);
    if (!candidates.length) throw new BadRequestException('Kein Node mit ausreichend Kapazität online');
    return candidates[0].node;
  }

  private async setState(vmId: string, vmName: string, state: 'running' | 'stopped') {
    await this.prisma.vm.update({ where: { id: vmId }, data: { state, errorMsg: null } });
    this.events.emitVmState(vmName, state);
    this.webhooks.fire(`vm.${state}`, { vmId, vmName, state }).catch(() => {});
  }

  async addNic(user: AuthenticatedUser, vmId: string, networkId: string, ipPoolId?: string) {
    const vm = await this.get(user, vmId);
    const network = await this.prisma.network.findUnique({ where: { id: networkId } });
    if (!network) throw new NotFoundException('Netzwerk nicht gefunden');
    return this.prisma.$transaction(async (tx) => {
      const nic = await tx.nic.create({
        data: { vmId: vm.id, networkId, mac: this.generateMac() },
      });
      if (ipPoolId) {
        const ip = await tx.ipAddress.findFirst({
          where: { poolId: ipPoolId, nicId: null, reserved: false },
        });
        if (!ip) throw new BadRequestException('Kein freies IP im Pool verfügbar');
        await tx.ipAddress.update({ where: { id: ip.id }, data: { nicId: nic.id } });
      }
      return tx.nic.findUnique({ where: { id: nic.id }, include: { network: true, ips: true } });
    });
  }

  async removeNic(user: AuthenticatedUser, vmId: string, nicId: string) {
    const vm = await this.get(user, vmId);
    const nic = await this.prisma.nic.findFirst({ where: { id: nicId, vmId: vm.id } });
    if (!nic) throw new NotFoundException('NIC nicht gefunden');
    const nicCount = await this.prisma.nic.count({ where: { vmId: vm.id } });
    if (nicCount <= 1) throw new BadRequestException('Letzte NIC kann nicht entfernt werden');
    await this.prisma.ipAddress.updateMany({ where: { nicId }, data: { nicId: null } });
    await this.prisma.nic.delete({ where: { id: nicId } });
  }

  private generateMac(): string {
    // Lokal verwaltete Unicast-MAC: 52:54:00 (QEMU-Prefix) + 3 Zufallsbytes
    const suffix = randomBytes(3);
    return `52:54:00:${[...suffix].map((b) => b.toString(16).padStart(2, '0')).join(':')}`;
  }

  // ─── PCI Passthrough ──────────────────────────────────────────────────────

  async listPci(user: AuthenticatedUser, vmId: string) {
    await this.get(user, vmId);
    return this.prisma.pciPassthrough.findMany({ where: { vmId } });
  }

  async addPci(user: AuthenticatedUser, vmId: string, dto: {
    domain?: string; bus: string; slot: string; function: string; label?: string;
  }) {
    const vm = await this.get(user, vmId);
    if (vm.state === 'running') throw new BadRequestException('VM muss gestoppt sein für PCI-Passthrough');
    return this.prisma.pciPassthrough.create({
      data: {
        vmId: vm.id,
        domain: dto.domain ?? '0x0000',
        bus: dto.bus,
        slot: dto.slot,
        function: dto.function,
        label: dto.label,
      },
    });
  }

  async removePci(user: AuthenticatedUser, vmId: string, pciId: string) {
    const vm = await this.get(user, vmId);
    await this.prisma.pciPassthrough.deleteMany({ where: { id: pciId, vmId: vm.id } });
  }

  private isAdminScope(user: AuthenticatedUser) {
    return user.permissions.includes('vm.create');
  }
}
