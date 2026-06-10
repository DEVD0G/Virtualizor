import {
  Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
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
  @IsArray() @ValidateNested({ each: true }) @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];
}

class ExecuteDto {
  @IsString() planId: string;
}

class DiagnoseDto {
  @IsIn(['vm', 'node']) resourceType: 'vm' | 'node';
  @IsString() resourceId: string;
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

  /** Non-streaming chat (for backwards compat / simple clients). */
  @Post('chat')
  @RequirePermissions('vm.read')
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChatDto) {
    return this.ai.chat(user, dto.messages);
  }

  /** Streaming SSE chat — streams text tokens, then emits plan event if any. */
  @Post('chat/stream')
  @RequirePermissions('vm.read')
  async chatStream(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await this.ai.chatStream(user, dto.messages, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    }
    res.end();
  }

  /** One-shot resource diagnostics. */
  @Post('diagnose')
  @RequirePermissions('vm.read')
  diagnose(@Body() dto: DiagnoseDto) {
    return this.ai.diagnose(dto.resourceType, dto.resourceId);
  }

  /** Execute a confirmed action plan stored in Redis. */
  @Post('execute')
  @RequirePermissions('vm.read')
  async execute(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExecuteDto) {
    const plan = await this.ai.getPlan(dto.planId);
    if (!plan) throw new NotFoundException('Aktionsplan nicht gefunden oder abgelaufen (max. 5 Minuten)');
    if (plan.userId !== user.id) throw new ForbiddenException();
    return this.executor.execute(plan, user);
  }
}
