import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
            <div className="rounded-lg p-3 font-mono text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="mb-1 font-sans text-xs" style={{ color: 'var(--tx-2)' }}>Auf dem Hypervisor ausführen (Token 15 min gültig):</p>
              <span style={{ color: 'var(--tx-1)' }}>sudo ./scripts/agent-install.sh --panel-url {window.location.origin} --join-token {joinToken}</span>
            </div>
          )}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Status</th><th>Hostname</th><th>CPU</th><th>RAM</th><th>CPU %</th><th>RAM %</th><th>VMs</th><th>Agent</th><th>Heartbeat</th></tr>
          </thead>
          <tbody>
            {nodes?.map((n) => {
              const cpuPct = n.cpuUsage ?? 0;
              const ramPct = n.memoryMb > 0 ? ((n.memUsedMb ?? 0) / n.memoryMb) * 100 : 0;
              const barColor = (pct: number) => pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
              return (
                <tr key={n.id}>
                  <td><Link className="font-medium text-brand-500 hover:underline" to={`/nodes/${n.id}`}>{n.name}</Link></td>
                  <td><StatusBadge status={n.state} /></td>
                  <td>{n.hostname}</td>
                  <td>{n.cpuCores} Cores</td>
                  <td>{(n.memoryMb / 1024).toFixed(0)} GiB</td>
                  <td>
                    <div className="flex min-w-[80px] items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full" style={{ background: 'var(--border)' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${cpuPct}%`, background: barColor(cpuPct) }} />
                      </div>
                      <span className="w-8 text-right text-xs" style={{ color: 'var(--tx-3)' }}>{cpuPct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex min-w-[80px] items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full" style={{ background: 'var(--border)' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${ramPct}%`, background: barColor(ramPct) }} />
                      </div>
                      <span className="w-8 text-right text-xs" style={{ color: 'var(--tx-3)' }}>{ramPct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td>{n._count?.vms ?? 0}</td>
                  <td>{n.agentVersion ?? '—'}</td>
                  <td>{n.lastHeartbeatAt ? new Date(n.lastHeartbeatAt).toLocaleTimeString() : '—'}</td>
                </tr>
              );
            })}
            {!nodes?.length && (
              <tr><td colSpan={10} className="text-center" style={{ color: 'var(--tx-3)' }}>Noch keine Nodes registriert</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
