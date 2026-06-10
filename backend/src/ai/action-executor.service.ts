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
        this.logger.log(`Plan-Schritt ${i + 1}/${plan.steps.length} (${step.capability}) erfolgreich`);
      } catch (err: any) {
        this.logger.warn(`Plan-Schritt ${i + 1} (${step.capability}) fehlgeschlagen: ${err.message}`);
        results.push({ stepIndex: i, capability: step.capability, success: false, error: err.message });
        break; // Stoppe bei erstem Fehler — bereits ausgeführte Schritte bleiben
      }
    }

    return results;
  }

  private async executeStep(step: ActionStep, user: AuthenticatedUser): Promise<Partial<ExecuteResult>> {
    switch (step.capability) {
      case 'vm.create': {
        const result = await this.vms.create(user, step.params as any);
        return { taskId: result.taskId };
      }

      case 'vm.start': {
        const result = await this.vms.power(user, step.params.vmId, 'start');
        return { taskId: result.taskId };
      }

      case 'vm.stop': {
        const result = await this.vms.power(user, step.params.vmId, 'stop', step.params.force ?? false);
        return { taskId: result.taskId };
      }

      case 'vm.restart': {
        const result = await this.vms.power(user, step.params.vmId, 'restart');
        return { taskId: result.taskId };
      }

      case 'vm.delete': {
        const result = await this.vms.remove(user, step.params.vmId);
        return { taskId: result.taskId };
      }

      case 'vm.snapshot.create': {
        const result = await this.vms.createSnapshot(
          user,
          step.params.vmId,
          step.params.snapshotName,
          step.params.description,
        );
        return { taskId: result.taskId, resourceId: result.snapshot.id };
      }

      case 'vm.backup.create': {
        const backup = await this.prisma.backup.create({
          data: {
            vmId: step.params.vmId,
            target: step.params.targetDir ?? '/var/lib/vcp/backups',
            state: 'running',
          },
        });
        return { resourceId: backup.id };
      }

      case 'network.create': {
        const network = await this.prisma.network.create({
          data: {
            name: step.params.name,
            mode: step.params.mode,
            bridge: step.params.bridge,
            vlanTag: step.params.vlanTag ?? null,
          },
        });
        return { resourceId: network.id };
      }

      default:
        throw new Error(`Unbekannte Capability: ${step.capability}`);
    }
  }
}
