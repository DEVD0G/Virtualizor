import { Body, Controller, Delete, Get, Ip, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { HeartbeatPayload, NodesService } from './nodes.service';

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

@Controller('nodes')
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

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

  @Delete(':id')
  @RequirePermissions('node.manage')
  remove(@Param('id') id: string) {
    return this.nodes.remove(id);
  }
}
