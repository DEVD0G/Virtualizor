import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NodesModule } from './nodes/nodes.module';
import { AgentModule } from './agent/agent.module';
import { VmsModule } from './vms/vms.module';
import { TasksModule } from './tasks/tasks.module';
import { LicenseModule } from './license/license.module';
import { AuditModule } from './audit/audit.module';
import { EventsModule } from './events/events.module';
import { ApiKeysModule } from './apikeys/apikeys.module';
import { NetworksModule } from './networks/networks.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { BackupsModule } from './backups/backups.module';
import { QuotasModule } from './quotas/quotas.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AlertsModule } from './alerts/alerts.module';
import { ContainersModule } from './containers/containers.module';
import { SettingsModule } from './settings/settings.module';
import { SchedulesModule } from './schedules/schedules.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { AuditInterceptor } from './audit/audit.interceptor';
import { LockedGuard } from './license/locked.guard';
import { HealthController } from './health.controller';
import { SeedService } from './bootstrap/seed.service';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthModule,
    UsersModule,
    NodesModule,
    AgentModule,
    VmsModule,
    TasksModule,
    LicenseModule,
    AuditModule,
    EventsModule,
    ApiKeysModule,
    NetworksModule,
    StorageModule,
    BackupsModule,
    AiModule,
    QuotasModule,
    WebhooksModule,
    AlertsModule,
    ContainersModule,
    SettingsModule,
    SchedulesModule,
  ],
  controllers: [HealthController],
  providers: [
    SeedService,
    // LockedGuard MUST be first: it short-circuits with 503 during install phase,
    // before rate limiting, auth, or permissions are evaluated.
    { provide: APP_GUARD, useClass: LockedGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
