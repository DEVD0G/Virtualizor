import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';
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
}
