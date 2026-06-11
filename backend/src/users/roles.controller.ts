import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

class CreateRoleDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) permissions: string[];
}

class UpdateRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
}

class UpsertQuotaDto {
  @IsOptional() @IsInt() @Min(0) maxVms?: number;
  @IsOptional() @IsInt() @Min(0) maxVcpus?: number;
  @IsOptional() @IsInt() @Min(0) maxMemoryMb?: number;
  @IsOptional() @IsInt() @Min(0) maxStorageGb?: number;
}

@Controller()
@RequirePermissions('user.manage')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('roles')
  listRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { select: { permissionId: true } }, _count: { select: { users: true } } },
    });
  }

  @Get('permissions')
  listPermissions() {
    return this.prisma.permission.findMany();
  }

  @Post('roles')
  async createRole(@Body() dto: CreateRoleDto) {
    return this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: { create: dto.permissions.map((permissionId) => ({ permissionId })) },
      },
    });
  }

  @Patch('roles/:id')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('Rolle nicht gefunden');
    if (role.isSystem) throw new BadRequestException('Systemrollen können nicht bearbeitet werden');

    return this.prisma.$transaction(async (tx) => {
      if (dto.permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (dto.permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permissions.map((permissionId) => ({ roleId: id, permissionId })),
            skipDuplicates: true,
          });
        }
      }
      return tx.role.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
        include: { permissions: { select: { permissionId: true } }, _count: { select: { users: true } } },
      });
    });
  }

  @Delete('roles/:id')
  async deleteRole(@Param('id') id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new BadRequestException('Rolle nicht gefunden');
    if (role.isSystem) throw new BadRequestException('Systemrollen können nicht gelöscht werden');
    if (role._count.users > 0) throw new BadRequestException('Rolle wird noch verwendet');
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  @Get('roles/:id/quota')
  async getQuota(@Param('id') id: string) {
    const quota = await this.prisma.resourceQuota.findUnique({ where: { roleId: id } });
    if (!quota) throw new NotFoundException('Kein Quota konfiguriert');
    return quota;
  }

  @Put('roles/:id/quota')
  async upsertQuota(@Param('id') id: string, @Body() dto: UpsertQuotaDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rolle nicht gefunden');
    return this.prisma.resourceQuota.upsert({
      where: { roleId: id },
      create: { roleId: id, ...dto },
      update: dto,
    });
  }

  @Delete('roles/:id/quota')
  @HttpCode(204)
  async deleteQuota(@Param('id') id: string) {
    await this.prisma.resourceQuota.deleteMany({ where: { roleId: id } });
  }
}
