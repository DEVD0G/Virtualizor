import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { QuotasModule } from '../quotas/quotas.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { VmsController } from './vms.controller';
import { VmsService } from './vms.service';

@Module({
  imports: [LicenseModule, QuotasModule, WebhooksModule],
  controllers: [VmsController],
  providers: [VmsService],
  exports: [VmsService],
})
export class VmsModule {}
