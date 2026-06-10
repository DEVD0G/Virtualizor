import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentClientService } from '../agent/agent-client.service';
import { TasksService, TaskHandler, TaskKind } from '../tasks/tasks.service';
import { EventsGateway } from '../events/events.gateway';
import { AuthenticatedUser } from '../auth/auth.service';

export class CreateContainerDto {
  name: string;
  nodeId?: string;
  vcpus: number;
  memoryMb: number;
  diskGb: number;
  osTemplate: string;
  ipAddress?: string;
  tags?: string[];
  description?: string;
}

@Injectable()
export class ContainersService implements TaskHandler, OnModuleInit {
  private readonly logger = new Logger(ContainersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentClientService,
    private readonly tasks: TasksService,
    private readonly events: EventsGateway,
  ) {}

  onModuleInit() {
    this.tasks.registerHandler(this);
  }

  private isAdminScope(user: AuthenticatedUser) {
    return user.permissions.includes('node.read');
  }

  async list(user: AuthenticatedUser) {
    return this.prisma.container.findMany({
      where: this.isAdminScope(user) ? {} : { ownerId: user.id },
      include: {
        node: { select: { id: true, name: true } },
        owner: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthenticatedUser, id: string) {
    const ct = await this.prisma.container.findUniqueOrThrow({
      where: { id },
      include: {
        node: { select: { id: true, name: true } },
        owner: { select: { id: true, email: true, name: true } },
      },
    });
    if (!this.isAdminScope(user) && ct.ownerId !== user.id) throw new ForbiddenException();
    return ct;
  }

  async create(user: AuthenticatedUser, dto: CreateContainerDto) {
    const exists = await this.prisma.container.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Container-Name bereits vergeben');

    let nodeId = dto.nodeId;
    if (!nodeId) {
      const node = await this.prisma.node.findFirst({ where: { state: 'online' }, orderBy: { memUsedMb: 'asc' } });
      if (!node) throw new BadRequestException('Kein online-Node verfügbar');
      nodeId = node.id;
    }

    const ct = await this.prisma.container.create({
      data: {
        name: dto.name,
        vcpus: dto.vcpus,
        memoryMb: dto.memoryMb,
        diskGb: dto.diskGb,
        osTemplate: dto.osTemplate,
        nodeId,
        ownerId: user.id,
        ipAddress: dto.ipAddress,
        tags: dto.tags ?? [],
        description: dto.description,
      },
    });

    const task = await this.tasks.enqueue('ct.provision', 'container', ct.id, { ctId: ct.id }, user.id);
    return { container: ct, taskId: task.id };
  }

  async power(user: AuthenticatedUser, id: string, action: 'start' | 'stop') {
    const ct = await this.get(user, id);
    const kind = `ct.${action}` as TaskKind;
    const task = await this.tasks.enqueue(kind, 'container', ct.id, { ctId: ct.id }, user.id);
    return { taskId: task.id };
  }

  async remove(user: AuthenticatedUser, id: string) {
    const ct = await this.get(user, id);
    await this.prisma.container.update({ where: { id: ct.id }, data: { state: 'deleting' } });
    const task = await this.tasks.enqueue('ct.delete', 'container', ct.id, { ctId: ct.id }, user.id);
    return { taskId: task.id };
  }

  async handle(kind: TaskKind, payload: Record<string, any>, onProgress: (p: number) => void) {
    const ct = await this.prisma.container.findUniqueOrThrow({
      where: { id: payload.ctId },
      include: { node: true },
    });
    const node = ct.node;

    switch (kind) {
      case 'ct.provision':
        onProgress(10);
        await this.agent.createContainer(node, {
          name: ct.name,
          vcpus: ct.vcpus,
          memoryMb: ct.memoryMb,
          diskGb: ct.diskGb,
          osTemplate: ct.osTemplate,
          ipAddress: ct.ipAddress ?? undefined,
        });
        await this.prisma.container.update({ where: { id: ct.id }, data: { state: 'running' } });
        this.events.emit('container.state', { name: ct.name, state: 'running' });
        break;

      case 'ct.start':
        await this.agent.startContainer(node, ct.name);
        await this.prisma.container.update({ where: { id: ct.id }, data: { state: 'running' } });
        this.events.emit('container.state', { name: ct.name, state: 'running' });
        break;

      case 'ct.stop':
        await this.agent.stopContainer(node, ct.name);
        await this.prisma.container.update({ where: { id: ct.id }, data: { state: 'stopped' } });
        this.events.emit('container.state', { name: ct.name, state: 'stopped' });
        break;

      case 'ct.delete':
        await this.agent.deleteContainer(node, ct.name);
        await this.prisma.container.delete({ where: { id: ct.id } });
        this.events.emit('container.state', { name: ct.name, state: 'deleted' });
        break;

      default:
        break;
    }
  }
}
