import {
  Body, Controller, ForbiddenException, Get, NotFoundException, Post,
} from '@nestjs/common';
import { IsArray, IsString, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { AiService } from './ai.service';
import { ActionExecutorService } from './action-executor.service';
import { CAPABILITIES } from './capability-registry';

class ChatMessageDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() content: string;
}

class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];
}

class ExecuteDto {
  @IsString() planId: string;
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly executor: ActionExecutorService,
  ) {}

  @Get('capabilities')
  @RequirePermissions('vm.read')
  getCapabilities() {
    return CAPABILITIES;
  }

  @Post('chat')
  @RequirePermissions('vm.read')
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChatDto) {
    return this.ai.chat(user, dto.messages);
  }

  @Post('execute')
  @RequirePermissions('vm.read')
  async execute(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExecuteDto) {
    const plan = await this.ai.getPlan(dto.planId);
    if (!plan) throw new NotFoundException('Aktionsplan nicht gefunden oder abgelaufen (max. 5 Minuten)');
    if (plan.userId !== user.id) throw new ForbiddenException();
    return this.executor.execute(plan, user);
  }
}
