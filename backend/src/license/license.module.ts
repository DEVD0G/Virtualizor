import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FingerprintModule } from './fingerprint.service';
import { SystemStateModule } from './system-state.service';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';

@Module({
  imports: [PrismaModule, FingerprintModule, SystemStateModule],
  controllers: [LicenseController],
  providers: [LicenseService],
  exports: [LicenseService, SystemStateModule],
})
export class LicenseModule {}
