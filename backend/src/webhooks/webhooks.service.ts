import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface WebhookDto {
  name: string;
  url: string;
  secret: string;
  events: string[];
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(dto: WebhookDto) {
    return this.prisma.webhook.create({ data: dto });
  }

  async update(id: string, dto: Partial<WebhookDto> & { active?: boolean }) {
    return this.prisma.webhook.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.webhook.delete({ where: { id } });
  }

  listDeliveries(webhookId: string) {
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { deliveredAt: 'desc' },
      take: 50,
    });
  }

  async fire(event: string, payload: Record<string, unknown>) {
    const hooks = await this.prisma.webhook.findMany({
      where: { active: true, events: { has: event } },
    });
    await Promise.allSettled(hooks.map((h) => this.deliver(h, event, payload)));
  }

  private async deliver(
    hook: { id: string; url: string; secret: string },
    event: string,
    payload: Record<string, unknown>,
  ) {
    const body = JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() });
    const sig = createHmac('sha256', hook.secret).update(body).digest('hex');

    let statusCode: number | undefined;
    let success = false;
    let error: string | undefined;

    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VCP-Signature': `sha256=${sig}`,
          'X-VCP-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      statusCode = res.status;
      success = res.ok;
      if (!success) error = `HTTP ${res.status}`;
    } catch (err: any) {
      error = err.message;
    }

    await this.prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event,
        payload: payload as Prisma.InputJsonValue,
        statusCode,
        success,
        error,
      },
    });

    if (!success) {
      this.logger.warn(`Webhook ${hook.id} delivery failed for event ${event}: ${error}`);
    }
  }
}
