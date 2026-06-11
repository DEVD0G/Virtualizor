import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AlertsService } from './alerts.service';

class CreateAlertDto {
  @IsString() name: string;
  @IsOptional() @IsUUID() nodeId?: string;
  @IsEnum(['cpu_percent', 'mem_used_mb', 'mem_percent']) metric: 'cpu_percent' | 'mem_used_mb' | 'mem_percent';
  @IsNumber() threshold: number;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
  @IsOptional() @IsInt() @Min(1) cooldownMinutes?: number;
  @IsOptional() @IsUUID() webhookId?: string;
}

class UpdateAlertDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() threshold?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
  @IsOptional() @IsInt() @Min(1) cooldownMinutes?: number;
  @IsOptional() @IsUUID() webhookId?: string;
}

@Controller('alerts')
export class AlertsController {
  constructor(private readonly svc: AlertsService) {}

  @Get()
  @RequirePermissions('node.read')
  list(@Query('nodeId') nodeId?: string) {
    return this.svc.list(nodeId);
  }

  @Post()
  @RequirePermissions('node.read')
  create(@Body() dto: CreateAlertDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('node.read')
  update(@Param('id') id: string, @Body() dto: UpdateAlertDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('node.read')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
