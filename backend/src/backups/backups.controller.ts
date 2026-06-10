import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { BackupsService } from './backups.service';

class CreateBackupDto {
  @IsOptional() @IsString() targetDir?: string;
}

@Controller()
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

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
}
