import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { HeartbeatPayload, NodesService } from './nodes.service';
import { AgentClientService } from '../agent/agent-client.service';

class CreateJoinTokenDto {
  @IsString() nodeName: string;
}

class JoinDto {
  @IsString() token: string;
  @IsString() csr: string;
  @IsString() fingerprint: string;
  @IsString() hostname: string;
  @IsInt() @Min(1) @Max(65535) agentPort: number;
}

class PatchNodeDto {
  @IsOptional() @IsBoolean() maintenance?: boolean;
}

class CreatePoolDto {
  @IsString() name: string;
  @IsIn(['dir', 'zfs', 'nfs', 'iscsi']) type: 'dir' | 'zfs' | 'nfs' | 'iscsi';
  @IsString() path: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

@Controller('nodes')
export class NodesController {
  constructor(
    private readonly nodes: NodesService,
    private readonly agent: AgentClientService,
  ) {}

  @Get()
  @RequirePermissions('node.read')
  list() {
    return this.nodes.list();
  }

  @Get(':id')
  @RequirePermissions('node.read')
  get(@Param('id') id: string) {
    return this.nodes.get(id);
  }

  @Get(':id/metrics')
  @RequirePermissions('node.read')
  metrics(@Param('id') id: string, @Query('hours') hours?: string) {
    return this.nodes.getMetrics(id, hours ? Math.min(parseInt(hours, 10), 168) : 1);
  }

  @Post('join-tokens')
  @RequirePermissions('node.manage')
  createJoinToken(@Body() dto: CreateJoinTokenDto) {
    return this.nodes.createJoinToken(dto.nodeName);
  }

  // Authentifizierung über den einmaligen Join-Token selbst.
  @Public()
  @Post('join')
  join(@Body() dto: JoinDto, @Ip() sourceIp: string) {
    return this.nodes.join({ ...dto, sourceIp: sourceIp.replace(/^::ffff:/, '') });
  }

  // In Produktion terminiert nginx das Agent-mTLS und setzt die Node-Identität;
  // der Heartbeat trägt zusätzlich die nodeId aus dem Agent-Zertifikat-CN.
  @Public()
  @Post(':id/heartbeat')
  heartbeat(@Param('id') id: string, @Body() payload: HeartbeatPayload) {
    return this.nodes.heartbeat(id, payload);
  }

  @Patch(':id')
  @RequirePermissions('node.manage')
  patch(@Param('id') id: string, @Body() dto: PatchNodeDto) {
    if (dto.maintenance !== undefined) return this.nodes.setMaintenance(id, dto.maintenance);
    return this.nodes.get(id);
  }

  @Post(':id/drain')
  @RequirePermissions('node.manage')
  drain(@Param('id') id: string) {
    return this.nodes.drain(id);
  }

  @Delete(':id')
  @RequirePermissions('node.manage')
  remove(@Param('id') id: string) {
    return this.nodes.remove(id);
  }

  @Get(':id/pci-devices')
  @RequirePermissions('node.read')
  async pciDevices(@Param('id') id: string) {
    const node = await this.nodes.get(id);
    return this.agent.listPciDevices(node as any);
  }

  @Post(':id/storage-pools')
  @RequirePermissions('node.manage')
  createPool(@Param('id') id: string, @Body() dto: CreatePoolDto) {
    return this.nodes.createStoragePool(id, dto);
  }

  @Patch(':id/storage-pools/:poolId/default')
  @RequirePermissions('node.manage')
  setDefaultPool(@Param('id') id: string, @Param('poolId') poolId: string) {
    return this.nodes.setDefaultPool(id, poolId);
  }

  @Delete(':id/storage-pools/:poolId')
  @HttpCode(204)
  @RequirePermissions('node.manage')
  removePool(@Param('id') id: string, @Param('poolId') poolId: string) {
    return this.nodes.removeStoragePool(id, poolId);
  }
}
