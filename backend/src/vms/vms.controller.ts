import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { CreateVmDto } from './dto/create-vm.dto';
import { VmsService } from './vms.service';

class StopDto {
  @IsOptional() force?: boolean;
}

class SnapshotDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
}

class ResizeVmDto {
  @IsOptional() @IsInt() @Min(1) @Max(128) vcpus?: number;
  @IsOptional() @IsInt() @Min(256) @Max(1048576) memoryMb?: number;
}

class ResizeDiskDto {
  @IsInt() @Min(1) @Max(16384) newSizeGb: number;
}

class CloneVmDto {
  @IsString() newName: string;
}

class MigrateVmDto {
  @IsUUID() targetNodeId: string;
}

class MountIsoDto {
  @IsUUID() isoId: string;
}

class UpdateVmMetaDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

class CreateFirewallRuleDto {
  @IsIn(['in', 'out']) direction: 'in' | 'out';
  @IsIn(['accept', 'drop']) action: 'accept' | 'drop';
  @IsIn(['tcp', 'udp', 'icmp', 'any']) protocol: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) portFrom?: number;
  @IsOptional() @IsInt() @Min(1) @Max(65535) portTo?: number;
  @IsOptional() @IsString() cidr?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) priority?: number;
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

  @Post(':id/clone')
  @RequirePermissions('vm.create')
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CloneVmDto) {
    return this.vms.clone(user, id, dto.newName);
  }

  @Post(':id/migrate')
  @RequirePermissions('vm.manage')
  migrate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MigrateVmDto) {
    return this.vms.migrate(user, id, dto.targetNodeId);
  }

  @Post(':id/iso')
  @RequirePermissions('vm.manage')
  mountIso(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MountIsoDto) {
    return this.vms.mountIso(user, id, dto.isoId);
  }

  @Delete(':id/iso')
  @HttpCode(204)
  @RequirePermissions('vm.manage')
  unmountIso(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.unmountIso(user, id);
  }

  @Patch(':id/meta')
  @RequirePermissions('vm.manage')
  updateMeta(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateVmMetaDto) {
    return this.vms.updateMeta(user, id, dto);
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

  @Patch(':id')
  @RequirePermissions('vm.create')
  resize(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResizeVmDto) {
    return this.vms.resize(user, id, dto);
  }

  @Patch(':id/disks/:diskId')
  @RequirePermissions('vm.create')
  resizeDisk(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('diskId') diskId: string,
    @Body() dto: ResizeDiskDto,
  ) {
    return this.vms.resizeDisk(user, id, diskId, dto.newSizeGb);
  }

  @Get(':id/console')
  @RequirePermissions('vm.console')
  console(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.consoleToken(user, id);
  }

  @Get(':id/firewall')
  @RequirePermissions('vm.firewall')
  listFirewall(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.vms.listFirewallRules(user, id);
  }

  @Post(':id/firewall')
  @RequirePermissions('vm.firewall')
  createFirewallRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateFirewallRuleDto,
  ) {
    return this.vms.createFirewallRule(user, id, dto);
  }

  @Delete(':id/firewall/:ruleId')
  @HttpCode(204)
  @RequirePermissions('vm.firewall')
  deleteFirewallRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.vms.deleteFirewallRule(user, id, ruleId);
  }
}
