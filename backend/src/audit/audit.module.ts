import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditInterceptor],
  exports: [AuditInterceptor],
})
export class AuditModule {}
