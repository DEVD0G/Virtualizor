import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { Node } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function NodesPage() {
  const { can } = useAuth();
  const [nodeName, setNodeName] = useState('');
  const [joinToken, setJoinToken] = useState('');

  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
    refetchInterval: 15_000,
  });

  const createToken = useMutation({
    mutationFn: () =>
      api<{ token: string }>('/nodes/join-tokens', { method: 'POST', body: { nodeName } }),
    onSuccess: (data) => setJoinToken(data.token),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nodes</h1>

      {can('node.manage') && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Node hinzufügen</h2>
          <div className="flex gap-2">
            <input className="input max-w-xs" placeholder="node-name (z.B. hv-01)"
              value={nodeName} onChange={(e) => setNodeName(e.target.value)} />
            <button className="btn-primary" disabled={!/^[a-z0-9][a-z0-9-]{2,62}$/.test(nodeName)}
              onClick={() => createToken.mutate()}>
              Join-Token erzeugen
            </button>
          </div>
          {joinToken && (
            <div className="rounded-lg bg-slate-100 p-3 font-mono text-xs dark:bg-slate-800">
              <p className="mb-1 font-sans text-slate-500">Auf dem Hypervisor ausführen (Token 15 min gültig):</p>
              sudo ./scripts/agent-install.sh --panel-url {window.location.origin} --join-token {joinToken}
            </div>
          )}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Status</th><th>Hostname</th><th>CPU</th><th>RAM</th><th>VMs</th><th>Agent</th><th>Letzter Heartbeat</th></tr>
          </thead>
          <tbody>
            {nodes?.map((n) => (
              <tr key={n.id}>
                <td className="font-medium">{n.name}</td>
                <td><StatusBadge status={n.state} /></td>
                <td>{n.hostname}</td>
                <td>{n.cpuCores} Cores</td>
                <td>{(n.memoryMb / 1024).toFixed(0)} GiB</td>
                <td>{n._count?.vms ?? 0}</td>
                <td>{n.agentVersion ?? '—'}</td>
                <td>{n.lastHeartbeatAt ? new Date(n.lastHeartbeatAt).toLocaleTimeString() : '—'}</td>
              </tr>
            ))}
            {!nodes?.length && (
              <tr><td colSpan={8} className="text-center text-slate-400">Noch keine Nodes registriert</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
