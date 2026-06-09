import { Module } from '@nestjs/common';
import { NetworksController } from './networks.controller';

@Module({
  controllers: [NetworksController],
})
export class NetworksModule {}
