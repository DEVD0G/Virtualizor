import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { VmsController } from './vms.controller';
import { VmsService } from './vms.service';

@Module({
  imports: [LicenseModule],
  controllers: [VmsController],
  providers: [VmsService],
  exports: [VmsService],
})
export class VmsModule {}
