import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.service';

export interface QuotaDto {
  maxVms?: number | null;
  maxVcpus?: number | null;
  maxMemoryMb?: number | null;
  maxStorageGb?: number | null;
}

@Injectable()
export class QuotasService {
  constructor(private readonly prisma: PrismaService) {}

  async getForRole(roleId: string) {
    return this.prisma.resourceQuota.findUnique({ where: { roleId } });
  }

  async upsert(roleId: string, dto: QuotaDto) {
    return this.prisma.resourceQuota.upsert({
      where: { roleId },
      create: { roleId, ...dto },
      update: dto,
    });
  }

  async remove(roleId: string) {
    await this.prisma.resourceQuota.deleteMany({ where: { roleId } });
  }

  async checkVmCreateQuota(user: AuthenticatedUser, vcpus: number, memoryMb: number, storageGb: number) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { roleId: true } });
    if (!dbUser) return;

    const quota = await this.prisma.resourceQuota.findUnique({ where: { roleId: dbUser.roleId } });
    if (!quota) return;

    const [vmCount, vcpuSum, memSum] = await Promise.all([
      this.prisma.vm.count({ where: { ownerId: user.id } }),
      this.prisma.vm.aggregate({ where: { ownerId: user.id }, _sum: { vcpus: true } }),
      this.prisma.vm.aggregate({ where: { ownerId: user.id }, _sum: { memoryMb: true } }),
    ]);

    if (quota.maxVms != null && vmCount >= quota.maxVms) {
      throw new ForbiddenException(`Quota exceeded: max ${quota.maxVms} VMs`);
    }
    if (quota.maxVcpus != null && (vcpuSum._sum.vcpus ?? 0) + vcpus > quota.maxVcpus) {
      throw new ForbiddenException(`Quota exceeded: max ${quota.maxVcpus} vCPUs`);
    }
    if (quota.maxMemoryMb != null && (memSum._sum.memoryMb ?? 0) + memoryMb > quota.maxMemoryMb) {
      throw new ForbiddenException(`Quota exceeded: max ${quota.maxMemoryMb} MiB memory`);
    }
    if (quota.maxStorageGb != null) {
      const diskSum = await this.prisma.volume.aggregate({
        where: { vm: { ownerId: user.id } },
        _sum: { sizeGb: true },
      });
      if ((diskSum._sum.sizeGb ?? 0) + storageGb > quota.maxStorageGb) {
        throw new ForbiddenException(`Quota exceeded: max ${quota.maxStorageGb} GiB storage`);
      }
    }
  }
}
