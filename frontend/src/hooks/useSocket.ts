import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '../api/client';

let socket: Socket | null = null;

/** Verbindet den Live-Event-Kanal und invalidiert betroffene Queries. */
export function useLiveEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    socket = io('/events', { auth: { token } });

    socket.on('vm.state', () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    });
    socket.on('node.state', () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
    });
    socket.on('task.update', (task: { state: string }) => {
      if (task.state === 'succeeded' || task.state === 'failed') {
        queryClient.invalidateQueries({ queryKey: ['vms'] });
      }
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [queryClient]);
}
