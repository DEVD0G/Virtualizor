import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { CronRunnerService } from './cron-runner.service';

@Module({
  controllers: [SchedulesController],
  providers: [CronRunnerService],
})
export class SchedulesModule {}
