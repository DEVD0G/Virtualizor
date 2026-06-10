import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.service';
import { VmsService } from '../vms/vms.service';
import { ActionPlan, ActionStep, ExecuteResult } from './types';

@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vms: VmsService,
  ) {}

  async execute(plan: ActionPlan, user: AuthenticatedUser): Promise<ExecuteResult[]> {
    const results: ExecuteResult[] = [];
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      try {
        const outcome = await this.executeStep(step, user);
        results.push({ stepIndex: i, capability: step.capability, success: true, ...outcome });
        this.logger.log(`Schritt ${i + 1}/${plan.steps.length} (${step.capability}) OK`);
      } catch (err: any) {
        this.logger.warn(`Schritt ${i + 1} (${step.capability}) fehlgeschlagen: ${err.message}`);
        results.push({ stepIndex: i, capability: step.capability, success: false, error: err.message });
        break; // Stoppe bei erstem Fehler
      }
    }
    return results;
  }

  private async executeStep(step: ActionStep, user: AuthenticatedUser): Promise<Partial<ExecuteResult>> {
    const p = step.params;

    switch (step.capability) {
      // ─── VM lifecycle ──────────────────────────────────────────────────────
      case 'vm.create': {
        const result = await this.vms.create(user, p as any);
        return { taskId: result.taskId };
      }
      case 'vm.start': {
        const result = await this.vms.power(user, p.vmId, 'start');
        return { taskId: result.taskId };
      }
      case 'vm.stop': {
        const result = await this.vms.power(user, p.vmId, 'stop', p.force ?? false);
        return { taskId: result.taskId };
      }
      case 'vm.restart': {
        const result = await this.vms.power(user, p.vmId, 'restart');
        return { taskId: result.taskId };
      }
      case 'vm.delete': {
        const result = await this.vms.remove(user, p.vmId);
        return { taskId: result.taskId };
      }
      case 'vm.resize': {
        const result = await this.vms.resize(user, p.vmId, { vcpus: p.vcpus, memoryMb: p.memoryMb });
        return { taskId: result.taskId };
      }

      // ─── Snapshots ─────────────────────────────────────────────────────────
      case 'vm.snapshot.create': {
        const result = await this.vms.createSnapshot(user, p.vmId, p.snapshotName, p.description);
        return { taskId: result.taskId, resourceId: result.snapshot.id };
      }
      case 'vm.snapshot.revert': {
        const result = await this.vms.revertSnapshot(user, p.vmId, p.snapshotId);
        return { taskId: result.taskId };
      }
      case 'vm.snapshot.delete': {
        const result = await this.vms.deleteSnapshot(user, p.vmId, p.snapshotId);
        return { taskId: result.taskId };
      }

      // ─── Backups ────────────────────────────────────────────────────────────
      case 'vm.backup.create': {
        const backup = await this.prisma.backup.create({
          data: { vmId: p.vmId, target: p.targetDir ?? '/var/lib/vcp/backups', state: 'running' },
        });
        return { resourceId: backup.id };
      }

      // ─── Firewall ───────────────────────────────────────────────────────────
      case 'firewall.rule.add': {
        const rule = await this.vms.createFirewallRule(user, p.vmId, {
          direction: p.direction,
          action: p.action,
          protocol: p.protocol,
          portFrom: p.portFrom,
          portTo: p.portTo,
          cidr: p.cidr,
          priority: p.priority,
        });
        return { resourceId: rule.id };
      }

      // ─── Networks ───────────────────────────────────────────────────────────
      case 'network.create': {
        const net = await this.prisma.network.create({
          data: { name: p.name, mode: p.mode, bridge: p.bridge, vlanTag: p.vlanTag ?? null },
        });
        return { resourceId: net.id };
      }

      default:
        throw new Error(`Unbekannte Capability: ${step.capability}`);
    }
  }
}
