import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { Webhook, WebhookDelivery } from '../api/types';

const AVAILABLE_EVENTS = [
  'vm.running', 'vm.stopped', 'alert.triggered',
];

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data: hooks } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api<Webhook[]>('/webhooks'),
  });
  const { data: deliveries } = useQuery({
    queryKey: ['webhook-deliveries', selectedId],
    queryFn: () => api<WebhookDelivery[]>(`/webhooks/${selectedId}/deliveries`),
    enabled: !!selectedId,
  });

  const create = useMutation({
    mutationFn: () => api('/webhooks', { method: 'POST', body: { name, url, secret, events } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] });
      setName(''); setUrl(''); setSecret(''); setEvents([]); setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: (h: Webhook) => api(`/webhooks/${h.id}`, { method: 'PATCH', body: { active: !h.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] });
      setSelectedId(null);
    },
  });

  function toggleEvent(ev: string) {
    setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Webhooks</h1>

      <form
        className="card grid gap-3"
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
      >
        <h2 className="font-semibold">Neuen Webhook anlegen</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="input" placeholder="URL (https://...)" value={url} onChange={(e) => setUrl(e.target.value)} required type="url" />
          <input className="input" placeholder="Secret (HMAC-SHA256)" value={secret} onChange={(e) => setSecret(e.target.value)} required />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Events</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} className="rounded" />
                <span className="text-sm font-mono">{ev}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="btn-primary w-fit" disabled={create.isPending || events.length === 0}>
          Anlegen
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-0 overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>Name</th><th>URL</th><th>Events</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {hooks?.map((h) => (
                <tr
                  key={h.id}
                  className={`cursor-pointer ${selectedId === h.id ? 'bg-brand-50 dark:bg-brand-500/10' : ''}`}
                  onClick={() => setSelectedId(h.id === selectedId ? null : h.id)}
                >
                  <td className="font-medium">{h.name}</td>
                  <td className="max-w-[160px] truncate text-xs text-slate-500">{h.url}</td>
                  <td className="text-xs">{h.events.join(', ')}</td>
                  <td>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggle.mutate(h); }}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${h.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'}`}
                    >
                      {h.active ? 'aktiv' : 'inaktiv'}
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm('Webhook löschen?')) remove.mutate(h.id); }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
              {!hooks?.length && (
                <tr><td colSpan={5} className="text-center text-slate-400">Keine Webhooks</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedId && (
          <div className="card">
            <h2 className="mb-3 font-semibold">Letzte Zustellungen</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {deliveries?.map((d) => (
                <div key={d.id} className={`rounded-lg p-2 text-xs border ${d.success ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
                  <div className="flex justify-between mb-1">
                    <span className="font-mono font-medium">{d.event}</span>
                    <span className={d.success ? 'text-emerald-600' : 'text-red-600'}>
                      {d.success ? `HTTP ${d.statusCode}` : d.error ?? 'Fehler'}
                    </span>
                  </div>
                  <span className="text-slate-500">{new Date(d.deliveredAt).toLocaleString()}</span>
                </div>
              ))}
              {!deliveries?.length && <p className="text-center text-slate-400">Keine Zustellungen</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
