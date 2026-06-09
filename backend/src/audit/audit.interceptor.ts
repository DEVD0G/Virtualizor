import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const SKIP_PATHS = [/^\/api\/v1\/auth\/refresh/, /^\/api\/v1\/nodes\/[^/]+\/heartbeat/];

/** Schreibt für jede mutierende API-Operation einen Audit-Eintrag (append-only). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    if (!MUTATING.has(req.method) || SKIP_PATHS.some((re) => re.test(req.originalUrl))) {
      return next.handle();
    }

    const write = (outcome: string, details?: unknown) => {
      const parts = (req.originalUrl as string).replace(/^\/api\/v1\//, '').split('?')[0].split('/');
      this.prisma.auditLog
        .create({
          data: {
            userId: req.user?.id ?? null,
            action: `${req.method} /${parts.join('/')}`,
            resourceType: parts[0] ?? 'unknown',
            resourceId: parts[1] ?? null,
            sourceIp: (req.ip as string)?.replace(/^::ffff:/, ''),
            userAgent: req.headers['user-agent'] ?? null,
            outcome,
            details: details ? JSON.parse(JSON.stringify(details)) : undefined,
          },
        })
        .catch((err) => this.logger.error(`Audit-Log fehlgeschlagen: ${err.message}`));
    };

    return next.handle().pipe(
      tap({
        next: () => write('success'),
        error: (err) => write(err?.status === 403 ? 'denied' : 'error', { message: err?.message }),
      }),
    );
  }
}
