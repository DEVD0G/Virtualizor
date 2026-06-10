import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class BackupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  async list(user: AuthenticatedUser, vmId: string) {
    await this.requireVmAccess(user, vmId);
    return this.prisma.backup.findMany({
      where: { vmId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthenticatedUser, vmId: string, targetDir?: string) {
    await this.requireVmAccess(user, vmId);
    const backup = await this.prisma.backup.create({
      data: { vmId, target: targetDir ?? '/var/lib/vcp/backups', state: 'running' },
    });
    const task = await this.tasks.enqueue(
      'vm.backup', 'vm', vmId,
      { vmId, backupId: backup.id, targetDir },
      user.id,
    );
    return { backup, taskId: task.id };
  }

  async remove(user: AuthenticatedUser, vmId: string, backupId: string) {
    await this.requireVmAccess(user, vmId);
    const backup = await this.prisma.backup.findFirst({ where: { id: backupId, vmId } });
    if (!backup) throw new NotFoundException('Backup nicht gefunden');
    await this.prisma.backup.delete({ where: { id: backupId } });
  }

  private async requireVmAccess(user: AuthenticatedUser, vmId: string) {
    const vm = await this.prisma.vm.findUnique({ where: { id: vmId } });
    if (!vm) throw new NotFoundException('VM nicht gefunden');
    if (!user.permissions.includes('backup.manage') && !user.permissions.includes('vm.create') && vm.ownerId !== user.id) {
      throw new ForbiddenException();
    }
    return vm;
  }
}
