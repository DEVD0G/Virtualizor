import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api/client';
import { Iso, Node, NodeDetail, Template } from '../api/types';
import { useAuth } from '../auth/AuthContext';

type Tab = 'templates' | 'isos' | 'cluster';

export default function StoragePage() {
  const [tab, setTab] = useState<Tab>('templates');
  const { can } = useAuth();
  const canManage = can('storage.manage');

  const TAB_LABELS: Record<Tab, string> = {
    templates: 'OS-Templates',
    isos: 'ISOs',
    cluster: 'Cluster-Storage',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Storage</h1>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['templates', 'isos', 'cluster'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'templates' && <TemplatesTab canManage={canManage} />}
      {tab === 'isos'      && <IsosTab canManage={canManage} />}
      {tab === 'cluster'   && <ClusterTab />}
    </div>
  );
}

// ─── Cluster Storage tab ──────────────────────────────────────────────────────

function ClusterTab() {
  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
  });

  const onlineNodes = nodes?.filter((n) => n.state === 'online') ?? [];

  if (!nodes) return <div className="text-slate-400">Lade…</div>;
  if (onlineNodes.length === 0) {
    return <div className="card text-center text-slate-400">Keine Online-Nodes verfügbar</div>;
  }

  const totalPools = onlineNodes.length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Storage Pools aller Online-Nodes. Klicke auf einen Node für Details.
      </p>
      {onlineNodes.map((n) => <NodePoolCard key={n.id} node={n} />)}
      {onlineNodes.length === 0 && (
        <div className="card text-center text-slate-400">Keine Nodes online</div>
      )}
    </div>
  );
}

function NodePoolCard({ node }: { node: Node }) {
  const { data: detail } = useQuery({
    queryKey: ['nodes', node.id],
    queryFn: () => api<NodeDetail>(`/nodes/${node.id}`),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const totalGb = detail?.storagePools.reduce((s, p) => s + p.totalGb, 0) ?? 0;
  const usedGb  = detail?.storagePools.reduce((s, p) => s + p.usedGb, 0) ?? 0;
  const pct = totalGb > 0 ? (usedGb / totalGb) * 100 : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <Link to={`/nodes/${node.id}`} className="font-semibold text-brand-500 hover:underline">
          {node.name}
        </Link>
        {totalGb > 0 && (
          <span className="text-xs text-slate-500">{usedGb} / {totalGb} GB genutzt</span>
        )}
      </div>

      {totalGb > 0 && (
        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
          <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}

      {!detail ? (
        <p className="text-xs text-slate-400">Lade Pools…</p>
      ) : detail.storagePools.length === 0 ? (
        <p className="text-xs text-slate-400">Keine Storage Pools konfiguriert</p>
      ) : (
        <table className="table-base text-xs">
          <thead>
            <tr><th>Pool</th><th>Typ</th><th>Pfad</th><th>Gesamt</th><th>Genutzt</th><th>%</th><th>Standard</th></tr>
          </thead>
          <tbody>
            {detail.storagePools.map((p) => {
              const poolPct = p.totalGb > 0 ? (p.usedGb / p.totalGb) * 100 : 0;
              const poolColor = poolPct > 90 ? 'bg-red-500' : poolPct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td><span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{p.type}</span></td>
                  <td className="font-mono text-slate-500 max-w-[160px] truncate">{p.path}</td>
                  <td>{p.totalGb > 0 ? `${p.totalGb} GB` : '—'}</td>
                  <td>{p.usedGb > 0 ? `${p.usedGb} GB` : '—'}</td>
                  <td>
                    {p.totalGb > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-16 rounded-full bg-slate-200 dark:bg-slate-700">
                          <div className={`h-1 rounded-full ${poolColor}`} style={{ width: `${Math.min(poolPct, 100)}%` }} />
                        </div>
                        <span className="text-slate-500">{poolPct.toFixed(0)}%</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td>{p.isDefault ? <span className="text-brand-500 font-medium">✓</span> : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Templates tab ────────────────────────────────────────────────────────────

function TemplatesTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data: templates, isLoading } = useQuery({
    queryKey: ['storage', 'templates'],
    queryFn: () => api<Template[]>('/storage/templates'),
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', sourceUrl: '', sha256: '', osType: 'linux', minDiskGb: '10' });
  const [formError, setFormError] = useState('');

  const create = useMutation({
    mutationFn: () => api('/storage/templates', { method: 'POST', body: { ...form, minDiskGb: parseInt(form.minDiskGb) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storage', 'templates'] }); setShowForm(false); setForm({ id: '', name: '', sourceUrl: '', sha256: '', osType: 'linux', minDiskGb: '10' }); },
    onError: (e: Error) => setFormError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/storage/templates/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['storage', 'templates'] }),
  });

  if (isLoading) return <div className="text-slate-400">Lade…</div>;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Abbrechen' : '+ Template hinzufügen'}
          </button>
        </div>
      )}

      {showForm && (
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); setFormError(''); create.mutate(); }}>
          <h3 className="font-semibold">Neues Template</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">ID (z.B. ubuntu-24.04)</label>
              <input className="input w-full font-mono" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required placeholder="distro-version" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Anzeigename</label>
              <input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ubuntu 24.04 LTS" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Source URL (qcow2/img)</label>
            <input className="input w-full font-mono text-xs" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} required placeholder="https://..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">SHA-256 (optional)</label>
              <input className="input w-full font-mono text-xs" value={form.sha256} onChange={(e) => setForm({ ...form, sha256: e.target.value })} placeholder="leer = kein Check" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">OS-Typ</label>
              <select className="input w-full" value={form.osType} onChange={(e) => setForm({ ...form, osType: e.target.value })}>
                <option value="linux">Linux</option>
                <option value="windows">Windows</option>
                <option value="bsd">BSD</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Min. Disk (GB)</label>
              <input className="input w-full" type="number" min={5} value={form.minDiskGb} onChange={(e) => setForm({ ...form, minDiskGb: e.target.value })} />
            </div>
          </div>
          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      )}

      <table className="table-base">
        <thead>
          <tr><th>ID</th><th>Name</th><th>OS</th><th>Min. Disk</th><th>SHA-256</th>{canManage && <th></th>}</tr>
        </thead>
        <tbody>
          {templates?.map((t) => (
            <tr key={t.id}>
              <td className="font-mono text-xs">{t.id}</td>
              <td>{t.name}</td>
              <td className="text-slate-500">{t.osType}</td>
              <td>{t.minDiskGb} GB</td>
              <td className="font-mono text-xs text-slate-500">{t.sha256 ? `${t.sha256.slice(0, 12)}…` : '—'}</td>
              {canManage && (
                <td className="text-right">
                  <button
                    className="btn-danger text-xs"
                    onClick={() => confirm(`Template "${t.name}" löschen?`) && del.mutate(t.id)}
                  >
                    Löschen
                  </button>
                </td>
              )}
            </tr>
          ))}
          {!templates?.length && (
            <tr><td colSpan={canManage ? 6 : 5} className="text-center text-slate-400">Keine Templates</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── ISOs tab ─────────────────────────────────────────────────────────────────

function IsosTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data: isos, isLoading } = useQuery({
    queryKey: ['storage', 'isos'],
    queryFn: () => api<Iso[]>('/storage/isos'),
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', sourceUrl: '', sha256: '' });
  const [formError, setFormError] = useState('');

  const create = useMutation({
    mutationFn: () => api('/storage/isos', { method: 'POST', body: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storage', 'isos'] }); setShowForm(false); setForm({ name: '', sourceUrl: '', sha256: '' }); },
    onError: (e: Error) => setFormError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/storage/isos/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['storage', 'isos'] }),
  });

  if (isLoading) return <div className="text-slate-400">Lade…</div>;

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Abbrechen' : '+ ISO hinzufügen'}
          </button>
        </div>
      )}

      {showForm && (
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); setFormError(''); create.mutate(); }}>
          <h3 className="font-semibold">Neue ISO</h3>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="ubuntu-24.04-server.iso" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Download-URL</label>
            <input className="input w-full font-mono text-xs" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} required placeholder="https://..." />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">SHA-256 (optional)</label>
            <input className="input w-full font-mono text-xs" value={form.sha256} onChange={(e) => setForm({ ...form, sha256: e.target.value })} placeholder="leer = kein Check" />
          </div>
          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      )}

      <table className="table-base">
        <thead>
          <tr><th>Name</th><th>URL</th><th>SHA-256</th><th>Erstellt</th>{canManage && <th></th>}</tr>
        </thead>
        <tbody>
          {isos?.map((iso) => (
            <tr key={iso.id}>
              <td>{iso.name}</td>
              <td className="font-mono text-xs text-slate-500 max-w-xs truncate">{iso.sourceUrl}</td>
              <td className="font-mono text-xs text-slate-500">{iso.sha256 ? `${iso.sha256.slice(0, 12)}…` : '—'}</td>
              <td>{new Date(iso.createdAt).toLocaleDateString()}</td>
              {canManage && (
                <td className="text-right">
                  <button
                    className="btn-danger text-xs"
                    onClick={() => confirm(`ISO "${iso.name}" löschen?`) && del.mutate(iso.id)}
                  >
                    Löschen
                  </button>
                </td>
              )}
            </tr>
          ))}
          {!isos?.length && (
            <tr><td colSpan={canManage ? 5 : 4} className="text-center text-slate-400">Keine ISOs</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
