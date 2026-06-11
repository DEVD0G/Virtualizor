import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

export type TaskKind =
  | 'vm.provision'
  | 'vm.clone'
  | 'vm.migrate'
  | 'vm.delete'
  | 'vm.start'
  | 'vm.stop'
  | 'vm.restart'
  | 'vm.snapshot'
  | 'vm.snapshot-revert'
  | 'vm.snapshot-delete'
  | 'vm.backup'
  | 'vm.restore'
  | 'vm.resize'
  | 'vm.disk-resize'
  | 'ct.provision'
  | 'ct.start'
  | 'ct.stop'
  | 'ct.restart'
  | 'ct.delete';

export interface TaskHandler {
  handle(kind: TaskKind, payload: Record<string, any>, onProgress: (p: number) => void): Promise<void>;
}

/**
 * BullMQ-Queue für alle VM-Operationen. Der Handler (VmsService) registriert
 * sich beim Boot, um zirkuläre Modulabhängigkeiten zu vermeiden.
 */
@Injectable()
export class TasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TasksService.name);
  private queue: Queue;
  private worker: Worker;
  private handler: TaskHandler | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly moduleRef: ModuleRef,
  ) {}

  registerHandler(handler: TaskHandler) {
    this.handler = handler;
  }

  onModuleInit() {
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    const connection = {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue('vcp-tasks', { connection });
    this.worker = new Worker(
      'vcp-tasks',
      async (job: Job) => this.process(job),
      { connection, concurrency: 8 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Task ${job?.id} fehlgeschlagen: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueue(
    kind: TaskKind,
    resourceType: string,
    resourceId: string,
    payload: Record<string, any>,
    createdById?: string,
  ) {
    const task = await this.prisma.task.create({
      data: { kind, resourceType, resourceId, createdById },
    });
    await this.queue.add(
      kind,
      { taskId: task.id, kind, payload },
      {
        jobId: `${kind}:${resourceId}:${task.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    return task;
  }

  async get(id: string) {
    return this.prisma.task.findUnique({ where: { id } });
  }

  async list(filter: { resourceId?: string; state?: string; limit?: number }) {
    return this.prisma.task.findMany({
      where: {
        ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
        ...(filter.state ? { state: filter.state as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
    });
  }

  private async process(job: Job) {
    const { taskId, kind, payload } = job.data as {
      taskId: string;
      kind: TaskKind;
      payload: Record<string, any>;
    };
    if (!this.handler) throw new Error('Kein Task-Handler registriert');

    await this.updateTask(taskId, { state: 'running', progress: 0 });
    try {
      await this.handler.handle(kind, payload, (progress) => {
        void this.updateTask(taskId, { progress });
      });
      await this.updateTask(taskId, { state: 'succeeded', progress: 100, finishedAt: new Date() });
      // Prune old backups after successful backup task
      if (kind === 'vm.backup' && payload.vmId) {
        await this.pruneBackups(payload.vmId, payload.keepLast ?? 3);
      }
    } catch (err: any) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isLastAttempt) {
        await this.updateTask(taskId, {
          state: 'failed',
          error: String(err?.message ?? err),
          finishedAt: new Date(),
        });
      }
      throw err;
    }
  }

  private async updateTask(id: string, data: Record<string, any>) {
    const task = await this.prisma.task.update({ where: { id }, data });
    this.events.emitTaskUpdate({
      id: task.id,
      kind: task.kind,
      resourceType: task.resourceType,
      resourceId: task.resourceId,
      state: task.state,
      progress: task.progress,
      error: task.error,
    });
  }

  private async pruneBackups(vmId: string, keepLast: number) {
    const backups = await this.prisma.backup.findMany({
      where: { vmId, state: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
    const toDelete = backups.slice(keepLast);
    for (const b of toDelete) {
      await this.prisma.backup.delete({ where: { id: b.id } });
      this.logger.log(`Backup ${b.id} für VM ${vmId} nach Retention-Policy gelöscht`);
    }
  }
}
