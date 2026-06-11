import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../api/client';

let socket: Socket | null = null;

export interface TaskUpdateEvent {
  id: string;
  kind: string;
  resourceType: string;
  resourceId: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  error?: string | null;
}

/** Verbindet den Live-Event-Kanal und invalidiert betroffene Queries. */
export function useLiveEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    socket = io('/events', { auth: { token } });

    socket.on('vm.state', (_data: { vmName: string; state: string }) => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    });

    socket.on('node.state', (_data: { nodeId: string; state: string; metrics: unknown }) => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
    });

    socket.on('container.state', (_data: { name: string; state: string }) => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    });

    socket.on('task.update', (task: TaskUpdateEvent) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      window.dispatchEvent(new CustomEvent('vcp:task:update', { detail: task }));

      if (task.state === 'succeeded' || task.state === 'failed') {
        if (task.resourceType === 'vm') {
          queryClient.invalidateQueries({ queryKey: ['vms'] });
          queryClient.invalidateQueries({ queryKey: ['vms', task.resourceId] });
        }
        if (task.resourceType === 'container') {
          queryClient.invalidateQueries({ queryKey: ['containers'] });
          queryClient.invalidateQueries({ queryKey: ['containers', task.resourceId] });
        }
        if (task.resourceType === 'node') {
          queryClient.invalidateQueries({ queryKey: ['nodes'] });
          queryClient.invalidateQueries({ queryKey: ['nodes', task.resourceId] });
        }
      }
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [queryClient]);
}
