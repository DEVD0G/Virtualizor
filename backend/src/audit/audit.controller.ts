import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(
    @Query('limit') limit = '100',
    @Query('offset') offset = '0',
    @Query('resourceType') resourceType?: string,
    @Query('outcome') outcome?: string,
    @Query('search') search?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const where: Prisma.AuditLogWhereInput = {
      ...(resourceType ? { resourceType } : {}),
      ...(outcome ? { outcome } : {}),
      ...(since || until ? {
        createdAt: {
          ...(since ? { gte: new Date(since) } : {}),
          ...(until ? { lte: new Date(until) } : {}),
        },
      } : {}),
      ...(search ? {
        OR: [
          { action: { contains: search, mode: 'insensitive' as const } },
          { sourceIp: { contains: search } },
          { user: { email: { contains: search, mode: 'insensitive' as const } } },
          { resourceType: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    return this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit, 10) || 100, 500),
      skip: parseInt(offset, 10) || 0,
    });
  }
}
