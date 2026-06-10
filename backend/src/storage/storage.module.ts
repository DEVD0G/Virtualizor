import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageController } from './storage.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StorageController],
})
export class StorageModule {}
