import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class BackupSchedulesService {
  private readonly logger = new Logger(BackupSchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  @Cron('*/5 * * * *')
  async runDue() {
    const now = new Date();
    const due = await this.prisma.backupSchedule.findMany({
      where: {
        enabled: true,
        OR: [{ lastRunAt: null }, { nextRunAt: { lte: now } }],
      },
    });

    for (const schedule of due) {
      try {
        const backup = await this.prisma.backup.create({
          data: {
            vmId: schedule.vmId,
            target: schedule.targetDir ?? '/var/lib/vcp/backups',
            state: 'running',
          },
        });
        await this.tasks.enqueue(
          'vm.backup', 'vm', schedule.vmId,
          { vmId: schedule.vmId, backupId: backup.id, targetDir: schedule.targetDir },
          undefined,
        );
        const nextRunAt = new Date(now.getTime() + schedule.intervalHours * 3_600_000);
        await this.prisma.backupSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt },
        });
        this.logger.log(`Geplantes Backup für VM ${schedule.vmId} gestartet`);
      } catch (err: any) {
        this.logger.error(`Geplantes Backup für VM ${schedule.vmId} fehlgeschlagen: ${err?.message}`);
      }
    }
  }

  list(vmId: string) {
    return this.prisma.backupSchedule.findMany({
      where: { vmId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(vmId: string, intervalHours: number, targetDir?: string) {
    const nextRunAt = new Date(Date.now() + intervalHours * 3_600_000);
    return this.prisma.backupSchedule.create({
      data: { vmId, intervalHours, targetDir, nextRunAt },
    });
  }

  async update(id: string, vmId: string, data: { enabled?: boolean; intervalHours?: number; targetDir?: string | null }) {
    await this.prisma.backupSchedule.findFirstOrThrow({ where: { id, vmId } });
    return this.prisma.backupSchedule.update({ where: { id }, data });
  }

  async remove(id: string, vmId: string) {
    await this.prisma.backupSchedule.deleteMany({ where: { id, vmId } });
  }
}
