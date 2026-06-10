import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { WebhooksService } from './webhooks.service';

class CreateWebhookDto {
  @IsString() name: string;
  @IsUrl() url: string;
  @IsString() secret: string;
  @IsArray() @IsString({ each: true }) events: string[];
}

class UpdateWebhookDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUrl() url?: string;
  @IsOptional() @IsString() secret?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) events?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Get()
  @RequirePermissions('node.read')
  list() {
    return this.svc.list();
  }

  @Post()
  @RequirePermissions('node.read')
  create(@Body() dto: CreateWebhookDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('node.read')
  update(@Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('node.read')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Get(':id/deliveries')
  @RequirePermissions('node.read')
  deliveries(@Param('id') id: string) {
    return this.svc.listDeliveries(id);
  }
}
