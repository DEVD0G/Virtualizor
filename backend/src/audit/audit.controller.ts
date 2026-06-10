import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(
    @Query('limit') limit = '100',
    @Query('resourceType') resourceType?: string,
  ) {
    return this.prisma.auditLog.findMany({
      where: resourceType ? { resourceType } : undefined,
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit, 10) || 100, 500),
    });
  }
}
