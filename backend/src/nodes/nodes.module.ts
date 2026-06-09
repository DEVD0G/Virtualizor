import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { CertsService } from './certs.service';

@Module({
  imports: [EventsModule],
  controllers: [NodesController],
  providers: [NodesService, CertsService],
  exports: [NodesService],
})
export class NodesModule {}
