import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequirePermissions('node.read')
  list(
    @Query('resourceId') resourceId?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tasks.list({ resourceId, state, limit: limit ? parseInt(limit) : undefined });
  }

  @Get(':id')
  @RequirePermissions('node.read')
  async get(@Param('id') id: string) {
    const task = await this.tasks.get(id);
    if (!task) throw new NotFoundException('Task nicht gefunden');
    return task;
  }
}
