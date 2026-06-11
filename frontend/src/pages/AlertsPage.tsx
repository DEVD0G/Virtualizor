import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { AlertRule, Node, Webhook } from '../api/types';

const METRIC_LABELS: Record<string, string> = {
  cpu_percent: 'CPU %',
  mem_used_mb: 'RAM (MiB)',
  mem_percent: 'RAM %',
};

export default function AlertsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [metric, setMetric] = useState<'cpu_percent' | 'mem_used_mb' | 'mem_percent'>('cpu_percent');
  const [threshold, setThreshold] = useState('80');
  const [duration, setDuration] = useState('5');
  const [cooldown, setCooldown] = useState('30');
  const [webhookId, setWebhookId] = useState('');
  const [error, setError] = useState('');

  const { data: rules } = useQuery({ queryKey: ['alerts'], queryFn: () => api<AlertRule[]>('/alerts') });
  const { data: nodes } = useQuery({ queryKey: ['nodes'], queryFn: () => api<Node[]>('/nodes') });
  const { data: hooks } = useQuery({ queryKey: ['webhooks'], queryFn: () => api<Webhook[]>('/webhooks') });

  const create = useMutation({
    mutationFn: () => api('/alerts', {
      method: 'POST',
      body: {
        name,
        nodeId: nodeId || undefined,
        metric,
        threshold: Number(threshold),
        durationMinutes: Number(duration),
        cooldownMinutes: Number(cooldown),
        webhookId: webhookId || undefined,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      setName(''); setThreshold('80'); setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: (r: AlertRule) => api(`/alerts/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/alerts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Alert-Regeln</h1>

      <form
        className="card grid gap-3"
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
      >
        <h2 className="font-semibold">Neue Regel</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <select className="input" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            <option value="">Alle Nodes</option>
            {nodes?.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
          <select className="input" value={metric} onChange={(e) => setMetric(e.target.value as any)}>
            {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="space-y-1">
            <label className="label">Schwellwert</label>
            <input className="input" type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="label">Dauer (Min.)</label>
            <input className="input" type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="label">Cooldown (Min.)</label>
            <input className="input" type="number" min="1" value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
          </div>
          <select className="input sm:col-span-3" value={webhookId} onChange={(e) => setWebhookId(e.target.value)}>
            <option value="">Kein Webhook</option>
            {hooks?.filter((h) => h.active).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="btn-primary w-fit" disabled={create.isPending}>Anlegen</button>
      </form>

      <div className="card p-0 overflow-hidden">
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Node</th><th>Metrik</th><th>Schwellwert</th><th>Webhook</th><th>Zuletzt ausgelöst</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rules?.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td>
                <td>{r.node?.name ?? <span style={{ color: 'var(--tx-3)' }}>Alle</span>}</td>
                <td className="font-mono text-xs">{METRIC_LABELS[r.metric]}</td>
                <td>{r.threshold}</td>
                <td>{r.webhook?.name ?? <span style={{ color: 'var(--tx-3)' }}>—</span>}</td>
                <td className="text-xs" style={{ color: 'var(--tx-2)' }}>{r.firedAt ? new Date(r.firedAt).toLocaleString() : '—'}</td>
                <td>
                  <button
                    onClick={() => toggle.mutate(r)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : ''}`}
                    style={r.enabled ? undefined : { background: 'var(--surface-3)', color: 'var(--tx-2)' }}
                  >
                    {r.enabled ? 'aktiv' : 'inaktiv'}
                  </button>
                </td>
                <td>
                  <button
                    onClick={() => { if (confirm('Regel löschen?')) remove.mutate(r.id); }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {!rules?.length && (
              <tr><td colSpan={8} className="text-center" style={{ color: 'var(--tx-3)' }}>Keine Regeln</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
