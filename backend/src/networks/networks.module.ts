import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NetworksController } from './networks.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NetworksController],
})
export class NetworksModule {}
