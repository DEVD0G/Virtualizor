import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { BackupSchedulesService } from './backup-schedules.service';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [PrismaModule, TasksModule],
  controllers: [BackupsController],
  providers: [BackupsService, BackupSchedulesService],
})
export class BackupsModule {}
