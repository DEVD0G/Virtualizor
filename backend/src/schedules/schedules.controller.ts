import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService, TaskKind } from '../tasks/tasks.service';

class CreateScheduleDto {
  @IsString() name: string;
  @IsString() targetType: string;
  @IsString() targetId: string;
  @IsOptional() @IsString() nodeId?: string;
  @IsString() cronExpr: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) keepLast?: number;
}

class UpdateScheduleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() cronExpr?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) keepLast?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() nodeId?: string;
}

@Controller('backup-schedules')
@RequirePermissions('vm.manage')
export class SchedulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  @Get()
  list() {
    return this.prisma.cronSchedule.findMany({ orderBy: { createdAt: 'asc' } });
  }

  @Post()
  create(@Body() dto: CreateScheduleDto) {
    return this.prisma.cronSchedule.create({
      data: {
        name: dto.name,
        targetType: dto.targetType,
        targetId: dto.targetId,
        ...(dto.nodeId ? { nodeId: dto.nodeId } : {}),
        cronExpr: dto.cronExpr,
        keepLast: dto.keepLast ?? 3,
      },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    const s = await this.prisma.cronSchedule.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Zeitplan nicht gefunden');
    return this.prisma.cronSchedule.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    const s = await this.prisma.cronSchedule.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Zeitplan nicht gefunden');
    await this.prisma.cronSchedule.delete({ where: { id } });
  }

  @Post(':id/toggle')
  async toggle(@Param('id') id: string) {
    const s = await this.prisma.cronSchedule.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Zeitplan nicht gefunden');
    return this.prisma.cronSchedule.update({
      where: { id },
      data: { enabled: !s.enabled },
    });
  }

  @Post(':id/run')
  async runNow(@Param('id') id: string) {
    const s = await this.prisma.cronSchedule.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Zeitplan nicht gefunden');
    const kind: TaskKind = s.targetType === 'vm' ? 'vm.backup' : 'vm.backup';
    const resourceType = s.targetType === 'vm' ? 'vm' : 'ct';
    if (s.targetType !== 'vm' && s.targetType !== 'ct') {
      throw new BadRequestException('Unbekannter Ziel-Typ');
    }
    const task = await this.tasks.enqueue(
      kind,
      resourceType,
      s.targetId,
      { keepLast: s.keepLast, ...(s.nodeId ? { nodeId: s.nodeId } : {}) },
    );
    await this.prisma.cronSchedule.update({ where: { id }, data: { lastRunAt: new Date() } });
    return task;
  }
}
