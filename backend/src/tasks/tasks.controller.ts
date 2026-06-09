import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    const task = await this.tasks.get(id);
    if (!task) throw new NotFoundException('Task nicht gefunden');
    return task;
  }
}
