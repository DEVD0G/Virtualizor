import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { Iso, Template } from '../api/types';
import { useAuth } from '../auth/AuthContext';

type Tab = 'templates' | 'isos';

export default function StoragePage() {
  const [tab, setTab] = useState<Tab>('templates');
  const { can } = useAuth();
  const canManage = can('storage.manage');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Storage</h1>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['templates', 'isos'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t === 'templates' ? 'OS-Templates' : 'ISOs'}
          </button>
        ))}
      </div>

      {tab === 'templates' && <TemplatesTab canManage={canManage} />}
      {tab === 'isos'      && <IsosTab canManage={canManage} />}
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
