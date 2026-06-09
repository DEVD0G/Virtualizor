import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsIP, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

class CreateNetworkDto {
  @Matches(/^[a-z0-9][a-z0-9-]{2,62}$/) name: string;
  @IsIn(['bridged', 'nat']) mode: 'bridged' | 'nat';
  @Matches(/^[a-zA-Z0-9_.-]{1,15}$/) bridge: string;
  @IsOptional() @IsInt() @Min(1) @Max(4094) vlanTag?: number;
}

class CreateIpPoolDto {
  @Matches(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/) cidr: string;
  @IsIP(4) gateway: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dns?: string[];
}

/** Expandiert ein IPv4-CIDR in Host-Adressen (ohne Netz-/Broadcast-Adresse). */
function expandCidr(cidr: string): string[] {
  const [base, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (prefix < 22 || prefix > 30) {
    throw new BadRequestException('Pool-CIDR muss zwischen /22 und /30 liegen');
  }
  const octets = base.split('.').map(Number);
  if (octets.some((o) => o < 0 || o > 255)) throw new BadRequestException('Ungültiges CIDR');
  const baseInt = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const size = 2 ** (32 - prefix);
  const network = (baseInt & (~(size - 1) >>> 0)) >>> 0;
  const ips: string[] = [];
  for (let i = 1; i < size - 1; i++) {
    const ip = (network + i) >>> 0;
    ips.push([ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.'));
  }
  return ips;
}

@Controller()
export class NetworksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('networks')
  @RequirePermissions('network.read')
  list() {
    return this.prisma.network.findMany({ include: { ipPools: true } });
  }

  @Post('networks')
  @RequirePermissions('network.manage')
  create(@Body() dto: CreateNetworkDto) {
    return this.prisma.network.create({ data: dto });
  }

  @Get('networks/:id/ip-pools')
  @RequirePermissions('network.read')
  listPools(@Param('id') id: string) {
    return this.prisma.ipPool.findMany({
      where: { networkId: id },
      include: { _count: { select: { addresses: true } } },
    });
  }

  @Post('networks/:id/ip-pools')
  @RequirePermissions('network.manage')
  async createPool(@Param('id') id: string, @Body() dto: CreateIpPoolDto) {
    const network = await this.prisma.network.findUnique({ where: { id } });
    if (!network) throw new BadRequestException('Netzwerk nicht gefunden');
    const ips = expandCidr(dto.cidr).filter((ip) => ip !== dto.gateway);
    return this.prisma.$transaction(async (tx) => {
      const pool = await tx.ipPool.create({
        data: { networkId: id, cidr: dto.cidr, gateway: dto.gateway, dns: dto.dns ?? ['1.1.1.1'] },
      });
      await tx.ipAddress.createMany({
        data: ips.map((address) => ({ address, poolId: pool.id })),
        skipDuplicates: true,
      });
      return pool;
    });
  }

  @Get('ip-addresses')
  @RequirePermissions('network.read')
  listIps() {
    return this.prisma.ipAddress.findMany({
      where: { nicId: { not: null } },
      include: { nic: { select: { vm: { select: { id: true, name: true } } } } },
    });
  }
}
