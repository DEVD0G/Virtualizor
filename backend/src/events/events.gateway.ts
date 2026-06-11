import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Live-Events für die UI. Auth über JWT im Handshake
 * (`socket.handshake.auth.token`). Rooms: vm:<name>, node:<id>, tasks.
 */
@WebSocketGateway({ namespace: '/events', cors: { origin: true } })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private readonly jwt = new JwtService({ secret: process.env.JWT_SECRET });

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      await this.jwt.verifyAsync(token);
      client.join('tasks');
    } catch {
      client.disconnect(true);
    }
  }

  emitVmState(vmName: string, state: string) {
    this.server?.emit('vm.state', { vmName, state });
  }

  emitNodeState(nodeId: string, state: string, metrics: unknown) {
    this.server?.emit('node.state', { nodeId, state, metrics });
  }

  emitTaskUpdate(task: { id: string; kind: string; resourceType: string; resourceId: string; state: string; progress: number; error?: string | null }) {
    this.server?.to('tasks').emit('task.update', task);
  }

  emit(event: string, data: unknown) {
    this.server?.emit(event, data);
  }
}
