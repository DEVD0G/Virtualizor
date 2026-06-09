import {
  Body, Controller, Delete, Get, Param, Post, Query,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { CreateVmDto } from './dto/create-vm.dto';
import { VmsService } from './vms.service';

class StopDto {
  @IsOptional() @IsBoolean() force?: boolean;
}

class SnapshotDto {
  @Matches(/^[a-z0-9][a-z0-9-]{1,62}$/) name: string;
  @IsOptional() @IsString() description?: string;
}

@Controller('vms')
export class VmsController {
  constructor(private readonly vms: VmsService) {}

  @Get()
  @RequirePermissions('vm.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('nodeId') nodeId?: string,
    @Query('state') state?: string,
  ) {
    return this.vms.list(user, { nodeId, state });
  }

  @Post()
  @RequirePermissions('vm.create')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVmDto) {
    return this.vms.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('vm.read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.get(user, id);
  }

  @Delete(':id')
  @RequirePermissions('vm.delete')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.remove(user, id);
  }

  @Post(':id/start')
  @RequirePermissions('vm.power')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.power(user, id, 'start');
  }

  @Post(':id/stop')
  @RequirePermissions('vm.power')
  stop(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: StopDto) {
    return this.vms.power(user, id, 'stop', dto.force);
  }

  @Post(':id/restart')
  @RequirePermissions('vm.power')
  restart(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.power(user, id, 'restart');
  }

  @Get(':id/snapshots')
  @RequirePermissions('vm.read')
  listSnapshots(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.listSnapshots(user, id);
  }

  @Post(':id/snapshots')
  @RequirePermissions('vm.snapshot')
  createSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SnapshotDto,
  ) {
    return this.vms.createSnapshot(user, id, dto.name, dto.description);
  }

  @Post(':id/snapshots/:snapId/revert')
  @RequirePermissions('vm.snapshot')
  revertSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('snapId') snapId: string,
  ) {
    return this.vms.revertSnapshot(user, id, snapId);
  }

  @Delete(':id/snapshots/:snapId')
  @RequirePermissions('vm.snapshot')
  deleteSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('snapId') snapId: string,
  ) {
    return this.vms.deleteSnapshot(user, id, snapId);
  }

  @Get(':id/console')
  @RequirePermissions('vm.console')
  console(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.consoleToken(user, id);
  }
}
