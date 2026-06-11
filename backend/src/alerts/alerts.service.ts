import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { MailService } from '../mail/mail.service';

export interface AlertRuleDto {
  name: string;
  nodeId?: string;
  metric: 'cpu_percent' | 'mem_used_mb' | 'mem_percent';
  threshold: number;
  durationMinutes?: number;
  cooldownMinutes?: number;
  webhookId?: string;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    private readonly mail: MailService,
  ) {}

  list(nodeId?: string) {
    return this.prisma.alertRule.findMany({
      where: nodeId ? { nodeId } : {},
      include: { node: { select: { id: true, name: true } }, webhook: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: AlertRuleDto) {
    return this.prisma.alertRule.create({ data: dto as any });
  }

  async update(id: string, dto: Partial<AlertRuleDto> & { enabled?: boolean }) {
    return this.prisma.alertRule.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.prisma.alertRule.delete({ where: { id } });
  }

  @Cron('*/1 * * * *')
  async evaluateAlerts() {
    const rules = await this.prisma.alertRule.findMany({
      where: { enabled: true },
      include: { node: true },
    });

    for (const rule of rules) {
      try {
        await this.evaluate(rule);
      } catch (err: any) {
        this.logger.error(`Alert evaluation failed for rule ${rule.id}: ${err.message}`);
      }
    }
  }

  private async evaluate(rule: any) {
    const now = new Date();

    // Cooldown: skip if fired recently
    if (rule.firedAt) {
      const cooldownMs = rule.cooldownMinutes * 60_000;
      if (now.getTime() - rule.firedAt.getTime() < cooldownMs) return;
    }

    const windowStart = new Date(now.getTime() - rule.durationMinutes * 60_000);
    const nodeFilter = rule.nodeId ? { nodeId: rule.nodeId } : {};

    const samples = await this.prisma.nodeMetricSample.findMany({
      where: { ...nodeFilter, sampledAt: { gte: windowStart } },
      include: { node: { select: { id: true, name: true, memoryMb: true } } },
    });

    if (samples.length === 0) return;

    const values = samples.map((s) => {
      if (rule.metric === 'cpu_percent') return s.cpuPercent;
      if (rule.metric === 'mem_used_mb') return s.memUsedMb;
      // mem_percent
      return s.node.memoryMb > 0 ? (s.memUsedMb / s.node.memoryMb) * 100 : 0;
    });

    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    if (avg <= rule.threshold) return;

    // Fire!
    await this.prisma.alertRule.update({ where: { id: rule.id }, data: { firedAt: now } });

    this.logger.warn(`Alert "${rule.name}" fired: ${rule.metric} avg=${avg.toFixed(1)} > ${rule.threshold}`);

    await this.webhooks.fire('alert.triggered', {
      alertRuleId: rule.id,
      alertName: rule.name,
      metric: rule.metric,
      threshold: rule.threshold,
      avgValue: avg,
      nodeId: rule.nodeId ?? null,
      nodeName: rule.node?.name ?? null,
    });

    // Send email to all admins with user.manage permission
    const admins = await this.prisma.user.findMany({
      where: {
        role: {
          permissions: { some: { permissionId: 'user.manage' } },
        },
      },
      select: { email: true },
    });
    for (const admin of admins) {
      await this.mail.send(
        admin.email,
        `VCP Alert: ${rule.name}`,
        `<p>Alert <strong>${rule.name}</strong> wurde ausgelöst.</p>
         <p>Metrik: ${rule.metric}, Durchschnitt: ${avg.toFixed(1)}, Schwelle: ${rule.threshold}</p>`,
      );
    }
  }
}
