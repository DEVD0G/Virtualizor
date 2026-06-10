import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { BackupSchedulesService } from './backup-schedules.service';
import { BackupsService } from './backups.service';

class CreateBackupDto {
  @IsOptional() @IsString() targetDir?: string;
}

class CreateScheduleDto {
  @IsInt() @Min(1) @Max(8760) intervalHours!: number;
  @IsOptional() @IsString() targetDir?: string;
}

class UpdateScheduleDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(8760) intervalHours?: number;
  @IsOptional() @IsString() targetDir?: string;
}

@Controller()
export class BackupsController {
  constructor(
    private readonly backups: BackupsService,
    private readonly schedules: BackupSchedulesService,
  ) {}

  // ─── Backups ───────────────────────────────────────────────────────────────

  @Get('vms/:vmId/backups')
  @RequirePermissions('backup.read')
  list(@CurrentUser() user: AuthenticatedUser, @Param('vmId') vmId: string) {
    return this.backups.list(user, vmId);
  }

  @Post('vms/:vmId/backups')
  @RequirePermissions('backup.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vmId') vmId: string,
    @Body() dto: CreateBackupDto,
  ) {
    return this.backups.create(user, vmId, dto.targetDir);
  }

  @Delete('vms/:vmId/backups/:id')
  @HttpCode(204)
  @RequirePermissions('backup.manage')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vmId') vmId: string,
    @Param('id') id: string,
  ) {
    return this.backups.remove(user, vmId, id);
  }

  // ─── Backup Schedules ──────────────────────────────────────────────────────

  @Get('vms/:vmId/backup-schedules')
  @RequirePermissions('backup.read')
  listSchedules(@Param('vmId') vmId: string) {
    return this.schedules.list(vmId);
  }

  @Post('vms/:vmId/backup-schedules')
  @RequirePermissions('backup.manage')
  createSchedule(@Param('vmId') vmId: string, @Body() dto: CreateScheduleDto) {
    return this.schedules.create(vmId, dto.intervalHours, dto.targetDir);
  }

  @Patch('vms/:vmId/backup-schedules/:id')
  @RequirePermissions('backup.manage')
  updateSchedule(
    @Param('vmId') vmId: string,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedules.update(id, vmId, dto);
  }

  @Delete('vms/:vmId/backup-schedules/:id')
  @HttpCode(204)
  @RequirePermissions('backup.manage')
  removeSchedule(@Param('vmId') vmId: string, @Param('id') id: string) {
    return this.schedules.remove(id, vmId);
  }
}
