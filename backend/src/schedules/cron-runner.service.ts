import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService, TaskKind } from '../tasks/tasks.service';

@Injectable()
export class CronRunnerService {
  private readonly logger = new Logger(CronRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  @Cron('*/5 * * * *')
  async runDue() {
    const now = new Date();
    const due = await this.prisma.cronSchedule.findMany({
      where: {
        enabled: true,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
    });

    for (const schedule of due) {
      try {
        const kind: TaskKind = 'vm.backup';
        const resourceType = schedule.targetType === 'vm' ? 'vm' : 'ct';
        await this.tasks.enqueue(
          kind,
          resourceType,
          schedule.targetId,
          { keepLast: schedule.keepLast, ...(schedule.nodeId ? { nodeId: schedule.nodeId } : {}) },
          undefined,
        );

        const next = CronExpressionParser.parse(schedule.cronExpr).next().toDate();
        await this.prisma.cronSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt: next },
        });
        this.logger.log(`CronSchedule "${schedule.name}" ausgeführt, nächste: ${next.toISOString()}`);
      } catch (err: any) {
        this.logger.error(`CronSchedule "${schedule.name}" fehlgeschlagen: ${err.message}`);
      }
    }
  }
}
