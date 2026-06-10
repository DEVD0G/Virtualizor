import { Module } from '@nestjs/common';
import { VmsModule } from '../vms/vms.module';
import { ActionExecutorService } from './action-executor.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [VmsModule],
  controllers: [AiController],
  providers: [AiService, ActionExecutorService],
})
export class AiModule {}
