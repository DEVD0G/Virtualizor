import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(opts: {
    userId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    sourceIp?: string;
    outcome?: string;
    details?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        id: randomUUID(),
        userId: opts.userId,
        action: opts.action,
        resourceType: opts.resourceType,
        resourceId: opts.resourceId,
        sourceIp: opts.sourceIp,
        outcome: opts.outcome ?? 'success',
        details: opts.details ? JSON.parse(JSON.stringify(opts.details)) : undefined,
      },
    });
  }
}
