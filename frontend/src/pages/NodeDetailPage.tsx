import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { MetricSample, NodeDetail, StoragePool } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import AiDiagnoseCard from '../components/AiDiagnoseCard';
import Sparkline from '../components/Sparkline';
import StatusBadge from '../components/StatusBadge';

const HOURS_OPTIONS = [1, 6, 24] as const;

function bar(pct: number) {
  const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full" style={{ background: 'var(--border)' }}>
        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-xs" style={{ color: 'var(--tx-3)' }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

export default function NodeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [hours, setHours] = useState<1 | 6 | 24>(1);
  const [showPoolForm, setShowPoolForm] = useState(false);
  const [poolForm, setPoolForm] = useState({ name: '', type: 'dir' as StoragePool['type'], path: '/var/lib/vcp/images', isDefault: false });

  const { data: node } = useQuery({
    queryKey: ['nodes', id],
    queryFn: () => api<NodeDetail>(`/nodes/${id}`),
    refetchInterval: 15_000,
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ['nodes', id, 'metrics', hours],
    queryFn: () => api<MetricSample[]>(`/nodes/${id}/metrics?hours=${hours}`),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['nodes', id] });

  const maintenance = useMutation({
    mutationFn: (on: boolean) => api(`/nodes/${id}`, { method: 'PATCH', body: { maintenance: on } }),
    onSuccess: invalidate,
  });

  const removeNode = useMutation({
    mutationFn: () => api(`/nodes/${id}`, { method: 'DELETE' }),
  });

  const drain = useMutation({
    mutationFn: () => api<{ migratedVms: number; taskIds: string[] }>(`/nodes/${id}/drain`, { method: 'POST' }),
    onSuccess: (data) => {
      setDrainResult(data);
      invalidate();
    },
  });

  const [drainResult, setDrainResult] = useState<{ migratedVms: number; taskIds: string[] } | null>(null);

  const createPool = useMutation({
    mutationFn: () => api(`/nodes/${id}/storage-pools`, { method: 'POST', body: poolForm }),
    onSuccess: () => { invalidate(); setShowPoolForm(false); setPoolForm({ name: '', type: 'dir', path: '/var/lib/vcp/images', isDefault: false }); },
  });

  const setDefaultPool = useMutation({
    mutationFn: (poolId: string) => api(`/nodes/${id}/storage-pools/${poolId}/default`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });

  const deletePool = useMutation({
    mutationFn: (poolId: string) => api(`/nodes/${id}/storage-pools/${poolId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  if (!node) return <div style={{ color: 'var(--tx-3)' }}>Lade…</div>;

  const cpuPct = node.cpuUsage ?? 0;
  const ramPct = node.memoryMb > 0 ? ((node.memUsedMb ?? 0) / node.memoryMb) * 100 : 0;
  const cpuData = metrics.map((m) => m.cpuPercent);
  const ramData = metrics.map((m) => node.memoryMb > 0 ? (m.memUsedMb / node.memoryMb) * 100 : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/nodes" className="text-sm hover:underline" style={{ color: 'var(--tx-3)' }}>← Nodes</Link>
          <h1 className="text-2xl font-semibold">{node.name}</h1>
          <StatusBadge status={node.state} />
        </div>
        {can('node.manage') && (
          <div className="flex gap-2">
            {node.state !== 'maintenance' && (
              <button
                className="btn-secondary"
                disabled={drain.isPending}
                onClick={() => {
                  if (confirm(`Alle VMs von "${node.name}" migrieren und Node in Wartung setzen?`)) {
                    drain.mutate();
                  }
                }}
              >
                {drain.isPending ? 'Draining…' : 'Drain'}
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={() => maintenance.mutate(node.state !== 'maintenance')}
            >
              {node.state === 'maintenance' ? 'Wartung beenden' : 'Wartung'}
            </button>
            <button
              className="btn-danger"
              onClick={() => { if (confirm(`Node "${node.name}" entfernen?`)) removeNode.mutate(); }}
            >
              Entfernen
            </button>
          </div>
        )}
      </div>

      {drainResult && (
        <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <span>
            Drain abgeschlossen: {drainResult.migratedVms} VM{drainResult.migratedVms !== 1 ? 's' : ''} zur Migration eingeplant. Node wurde in Wartungsmodus versetzt.
          </span>
          <button className="text-xs underline ml-4" onClick={() => setDrainResult(null)}>Schließen</button>
        </div>
      )}

      {/* Info + live stats */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Konfiguration</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Hostname</dt><dd>{node.hostname}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Agent-Adresse</dt><dd className="font-mono text-xs">{node.agentAddress}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Agent-Version</dt><dd>{node.agentVersion ?? '—'}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>CPU</dt><dd>{node.cpuCores} Cores</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>RAM</dt><dd>{(node.memoryMb / 1024).toFixed(0)} GiB</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Heartbeat</dt><dd>{node.lastHeartbeatAt ? new Date(node.lastHeartbeatAt).toLocaleTimeString() : '—'}</dd></div>
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Auslastung (live)</h2>
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between text-xs" style={{ color: 'var(--tx-2)' }}><span>CPU</span><span>{cpuPct.toFixed(1)}%</span></div>
              {bar(cpuPct)}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs" style={{ color: 'var(--tx-2)' }}><span>RAM</span><span>{(node.memUsedMb / 1024).toFixed(1)} / {(node.memoryMb / 1024).toFixed(0)} GiB</span></div>
              {bar(ramPct)}
            </div>
          </div>
        </div>
      </div>

      {/* Sparklines */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Metriken</h2>
          <div className="flex gap-1">
            {HOURS_OPTIONS.map((h) => (
              <button key={h} onClick={() => setHours(h)}
                className="rounded px-2 py-1 text-xs font-medium transition-colors"
                style={hours === h ? { background: 'var(--brand)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--tx-2)' }}>
                {h}h
              </button>
            ))}
          </div>
        </div>
        {metrics.length < 2 ? (
          <p className="text-sm" style={{ color: 'var(--tx-3)' }}>Noch keine Metrik-Daten für den gewählten Zeitraum.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--tx-2)' }}>CPU %</div>
              <Sparkline data={cpuData} width={300} height={48} max={100} color="var(--brand)" />
              <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--tx-3)' }}>
                <span>{new Date(metrics[0].sampledAt).toLocaleTimeString()}</span>
                <span>{new Date(metrics[metrics.length - 1].sampledAt).toLocaleTimeString()}</span>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--tx-2)' }}>RAM %</div>
              <Sparkline data={ramData} width={300} height={48} max={100} color="#22c55e" />
              <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--tx-3)' }}>
                <span>{new Date(metrics[0].sampledAt).toLocaleTimeString()}</span>
                <span>{new Date(metrics[metrics.length - 1].sampledAt).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Storage Pools */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Storage Pools</h2>
          {can('node.manage') && (
            <button className="btn-secondary text-xs" onClick={() => setShowPoolForm(!showPoolForm)}>
              {showPoolForm ? 'Abbrechen' : '+ Pool'}
            </button>
          )}
        </div>

        {showPoolForm && (
          <div className="mb-4 grid gap-3 rounded-lg p-3 sm:grid-cols-2 lg:grid-cols-4" style={{ border: '1px solid var(--border)' }}>
            <div>
              <label className="label">Name</label>
              <input className="input" placeholder="local-ssd" value={poolForm.name}
                onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Typ</label>
              <select className="input" value={poolForm.type}
                onChange={(e) => setPoolForm({ ...poolForm, type: e.target.value as StoragePool['type'] })}>
                <option value="dir">Verzeichnis (dir)</option>
                <option value="zfs">ZFS</option>
                <option value="nfs">NFS</option>
                <option value="iscsi">iSCSI</option>
              </select>
            </div>
            <div>
              <label className="label">Pfad / Dataset</label>
              <input className="input" placeholder="/var/lib/vcp/images" value={poolForm.path}
                onChange={(e) => setPoolForm({ ...poolForm, path: e.target.value })} />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={poolForm.isDefault}
                  onChange={(e) => setPoolForm({ ...poolForm, isDefault: e.target.checked })} />
                Standard
              </label>
              <button className="btn-primary flex-1" disabled={createPool.isPending || !poolForm.name || !poolForm.path}
                onClick={() => createPool.mutate()}>
                {createPool.isPending ? 'Erstelle…' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        )}

        <table className="table-base">
          <thead><tr><th>Name</th><th>Typ</th><th>Pfad</th><th>Gesamt</th><th>Genutzt</th><th>Standard</th><th></th></tr></thead>
          <tbody>
            {node.storagePools.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}</td>
                <td><span className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--surface-3)', color: 'var(--tx-2)' }}>{p.type}</span></td>
                <td className="font-mono text-xs">{p.path}</td>
                <td>{p.totalGb > 0 ? `${p.totalGb} GB` : '—'}</td>
                <td>{p.usedGb > 0 ? `${p.usedGb} GB` : '—'}</td>
                <td>{p.isDefault ? <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>✓ Standard</span> : ''}</td>
                <td className="space-x-2 text-right">
                  {can('node.manage') && !p.isDefault && (
                    <button className="btn-secondary text-xs" onClick={() => setDefaultPool.mutate(p.id)}>Als Standard</button>
                  )}
                  {can('node.manage') && (
                    <button className="btn-danger text-xs"
                      onClick={() => { if (confirm(`Pool "${p.name}" löschen?`)) deletePool.mutate(p.id); }}>
                      Löschen
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!node.storagePools.length && (
              <tr><td colSpan={7} className="text-center" style={{ color: 'var(--tx-3)' }}>Keine Pools</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <AiDiagnoseCard resourceType="node" resourceId={node.id} />

      {/* VMs on this node */}
      <div className="card">
        <h2 className="mb-3 font-semibold">VMs auf diesem Node</h2>
        <table className="table-base">
          <thead><tr><th>Name</th><th>Status</th><th>vCPUs</th><th>RAM</th></tr></thead>
          <tbody>
            {node.vms.map((vm) => (
              <tr key={vm.id}>
                <td><Link className="font-medium text-brand-500 hover:underline" to={`/vms/${vm.id}`}>{vm.name}</Link></td>
                <td><StatusBadge status={vm.state as any} /></td>
                <td>{vm.vcpus}</td>
                <td>{(vm.memoryMb / 1024).toFixed(1)} GiB</td>
              </tr>
            ))}
            {!node.vms.length && (
              <tr><td colSpan={4} className="text-center" style={{ color: 'var(--tx-3)' }}>Keine VMs</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
