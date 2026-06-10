import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { IsInt, IsOptional, Min } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { QuotasService } from './quotas.service';

class UpsertQuotaDto {
  @IsOptional() @IsInt() @Min(0) maxVms?: number;
  @IsOptional() @IsInt() @Min(0) maxVcpus?: number;
  @IsOptional() @IsInt() @Min(0) maxMemoryMb?: number;
  @IsOptional() @IsInt() @Min(0) maxStorageGb?: number;
}

@Controller('roles/:roleId/quota')
export class QuotasController {
  constructor(private readonly svc: QuotasService) {}

  @Get()
  @RequirePermissions('user.manage')
  get(@Param('roleId') roleId: string) {
    return this.svc.getForRole(roleId);
  }

  @Put()
  @RequirePermissions('user.manage')
  upsert(@Param('roleId') roleId: string, @Body() dto: UpsertQuotaDto) {
    return this.svc.upsert(roleId, dto);
  }

  @Delete()
  @RequirePermissions('user.manage')
  remove(@Param('roleId') roleId: string) {
    return this.svc.remove(roleId);
  }
}
