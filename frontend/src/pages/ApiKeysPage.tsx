import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { ApiKey } from '../api/types';
import { useAuth } from '../auth/AuthContext';

const ALL_SCOPES = [
  'vm.read', 'vm.create', 'vm.delete', 'vm.power', 'vm.snapshot', 'vm.console',
  'node.read', 'network.read', 'storage.read', 'backup.read', 'audit.read', 'license.read',
];

export default function ApiKeysPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['vm.read']);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  const { data: keys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api<ApiKey[]>('/api-keys'),
  });

  const create = useMutation({
    mutationFn: () => api<{ key: string }>('/api-keys', { method: 'POST', body: { name, scopes } }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      setNewKey(data.key);
      setShowForm(false);
      setName('');
      setScopes(['vm.read']);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/api-keys/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  function toggleScope(s: string) {
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  function copyKey(k: string) {
    navigator.clipboard.writeText(k).catch(() => undefined);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  const availableScopes = ALL_SCOPES.filter((s) => user?.permissions.includes(s));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API-Keys</h1>
        <button className="btn-primary" onClick={() => { setShowForm(!showForm); setFormError(''); setNewKey(null); }}>
          {showForm ? 'Abbrechen' : '+ Neuer API-Key'}
        </button>
      </div>

      {/* One-time key display */}
      {newKey && (
        <div className="card border border-emerald-500/30 bg-emerald-500/5 space-y-3">
          <p className="text-sm font-medium text-emerald-400">
            API-Key erstellt — wird nur einmal angezeigt!
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded px-3 py-2 text-xs font-mono break-all select-all" style={{ background: 'var(--surface-2)', color: 'var(--tx-1)' }}>
              {newKey}
            </code>
            <button className="btn-secondary shrink-0 text-xs px-3" onClick={() => copyKey(newKey)}>
              {copiedKey ? 'Kopiert!' : 'Kopieren'}
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--tx-2)' }}>
            Diesen Key sicher speichern. Er kann nicht erneut abgerufen werden.
          </p>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form
          className="card space-y-4"
          onSubmit={(e) => { e.preventDefault(); setFormError(''); create.mutate(); }}
        >
          <h3 className="font-semibold">Neuer API-Key</h3>
          <div>
            <label className="label">Name / Beschreibung</label>
            <input
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Deploy-Script, Monitoring, …"
            />
          </div>
          <div>
            <label className="label">Berechtigungen (Scopes)</label>
            <div className="grid grid-cols-3 gap-2">
              {availableScopes.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                    className="rounded"
                  />
                  <span className="font-mono text-xs">{s}</span>
                </label>
              ))}
            </div>
          </div>
          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={create.isPending || scopes.length === 0}>
              {create.isPending ? 'Erstelle…' : 'Key erstellen'}
            </button>
          </div>
        </form>
      )}

      {/* Key list */}
      {isLoading ? (
        <div style={{ color: 'var(--tx-3)' }}>Lade…</div>
      ) : (
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Präfix</th><th>Scopes</th><th>Zuletzt verwendet</th><th>Erstellt</th><th></th></tr>
          </thead>
          <tbody>
            {keys?.map((k) => (
              <tr key={k.id}>
                <td className="font-medium">{k.name}</td>
                <td className="font-mono text-xs" style={{ color: 'var(--tx-3)' }}>{k.prefix}_…</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <span key={s} className="rounded px-1.5 py-0.5 text-xs font-mono" style={{ background: 'var(--surface-3)', color: 'var(--tx-2)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-sm" style={{ color: 'var(--tx-2)' }}>
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : '—'}
                </td>
                <td className="text-sm" style={{ color: 'var(--tx-2)' }}>{new Date(k.createdAt).toLocaleDateString()}</td>
                <td className="text-right">
                  <button
                    className="btn-danger text-xs"
                    onClick={() => confirm(`API-Key "${k.name}" widerrufen?`) && del.mutate(k.id)}
                  >
                    Widerrufen
                  </button>
                </td>
              </tr>
            ))}
            {!keys?.length && (
              <tr><td colSpan={6} className="text-center" style={{ color: 'var(--tx-3)' }}>Keine API-Keys</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
