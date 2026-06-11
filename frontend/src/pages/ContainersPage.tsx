import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Container, Node } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

const CT_STATES = ['provisioning', 'stopped', 'running', 'error', 'deleting'] as const;

const OS_TEMPLATES = [
  'debian-12',
  'ubuntu-22.04',
  'ubuntu-24.04',
  'alpine-3.19',
  'rockylinux-9',
  'fedora-39',
];

const defaultForm = {
  name: '',
  vcpus: 1,
  memoryMb: 512,
  diskGb: 10,
  osTemplate: 'debian-12',
  ipAddress: '',
  description: '',
  nodeId: '',
};

export default function ContainersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [formErr, setFormErr] = useState('');

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  const { data: containers, isLoading } = useQuery({
    queryKey: ['containers'],
    queryFn: () => api<Container[]>('/containers'),
    refetchInterval: 10_000,
  });

  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
    enabled: can('node.read'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['containers'] });

  const create = useMutation({
    mutationFn: (body: typeof form & { nodeId?: string }) => api('/containers', { method: 'POST', body }),
    onSuccess: () => { invalidate(); setShowCreate(false); setForm(defaultForm); setFormErr(''); },
    onError: (e: any) => setFormErr(e?.message ?? 'Fehler beim Erstellen'),
  });

  const action = useMutation({
    mutationFn: ({ path, method }: { path: string; method?: string }) =>
      api(path, { method: method ?? 'POST', body: {} }),
    onSettled: invalidate,
  });

  function handleCreate() {
    if (!/^[a-z0-9][-a-z0-9]{2,62}$/.test(form.name)) {
      setFormErr('Name: 3–63 Zeichen, nur a-z, 0-9 und Bindestrich');
      return;
    }
    const body: any = { ...form };
    if (!body.nodeId) delete body.nodeId;
    if (!body.ipAddress) delete body.ipAddress;
    if (!body.description) delete body.description;
    create.mutate(body);
  }

  const filtered = useMemo(() => {
    if (!containers) return [];
    return containers.filter((ct) => {
      if (search && !ct.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (stateFilter && ct.state !== stateFilter) return false;
      if (nodeFilter && ct.node.id !== nodeFilter) return false;
      if (tagFilter && !(ct.tags ?? []).some((t) => t.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
      return true;
    });
  }, [containers, search, stateFilter, nodeFilter, tagFilter]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function bulkAction(act: 'start' | 'stop' | 'delete') {
    const ids = [...selected];
    setBulkPending(true);
    try {
      await Promise.allSettled(
        ids.map((id) =>
          act === 'delete'
            ? api(`/containers/${id}`, { method: 'DELETE' })
            : api(`/containers/${id}/${act}`, { method: 'POST', body: {} }),
        ),
      );
    } finally {
      setBulkPending(false);
      setSelected(new Set());
      invalidate();
    }
  }

  const selectedCts = filtered.filter((c) => selected.has(c.id));
  const canBulkStart = selectedCts.some((c) => c.state === 'stopped');
  const canBulkStop = selectedCts.some((c) => c.state === 'running');
  const hasFilter = !!(search || stateFilter || nodeFilter || tagFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">LXC Container</h1>
        {can('vm.create') && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Neuer Container</button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Name suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-52"
        />
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="input w-40">
          <option value="">Alle Status</option>
          {CT_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {can('node.read') && nodes && (
          <select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} className="input w-44">
            <option value="">Alle Nodes</option>
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}
        <input
          type="text"
          placeholder="Tag filtern…"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="input w-36"
        />
        {hasFilter && (
          <button className="btn-secondary"
            onClick={() => { setSearch(''); setStateFilter(''); setNodeFilter(''); setTagFilter(''); }}>
            Zurücksetzen
          </button>
        )}
        <span className="ml-auto self-center text-sm text-slate-500">
          {filtered.length}{hasFilter ? ` von ${containers?.length ?? 0}` : ''} Container
        </span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 dark:border-brand-500/30 dark:bg-brand-500/10">
          <span className="text-sm font-medium text-brand-700 dark:text-brand-400">
            {selected.size} Container ausgewählt
          </span>
          <div className="flex gap-2">
            {can('vm.power') && canBulkStart && (
              <button className="btn-primary text-xs" disabled={bulkPending}
                onClick={() => bulkAction('start')}>Start</button>
            )}
            {can('vm.power') && canBulkStop && (
              <button className="btn-secondary text-xs" disabled={bulkPending}
                onClick={() => bulkAction('stop')}>Stop</button>
            )}
            {can('vm.delete') && (
              <button className="btn-danger text-xs" disabled={bulkPending}
                onClick={() => {
                  if (confirm(`${selected.size} Container löschen?`)) bulkAction('delete');
                }}>
                Löschen
              </button>
            )}
          </div>
          <button className="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            onClick={() => setSelected(new Set())}>
            Auswahl aufheben
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-semibold">Neuen Container erstellen</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input className="input" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value.replace(/[^a-z0-9-]/g, '') })}
                  placeholder="mein-container" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">vCPUs</label>
                  <input className="input" type="number" min="1" max="128" value={form.vcpus}
                    onChange={(e) => setForm({ ...form, vcpus: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="label">RAM (MiB)</label>
                  <input className="input" type="number" min="128" step="128" value={form.memoryMb}
                    onChange={(e) => setForm({ ...form, memoryMb: parseInt(e.target.value) || 512 })} />
                </div>
                <div>
                  <label className="label">Disk (GB)</label>
                  <input className="input" type="number" min="5" max="4096" value={form.diskGb}
                    onChange={(e) => setForm({ ...form, diskGb: parseInt(e.target.value) || 10 })} />
                </div>
              </div>
              <div>
                <label className="label">OS-Template</label>
                <select className="input" value={form.osTemplate}
                  onChange={(e) => setForm({ ...form, osTemplate: e.target.value })}>
                  {OS_TEMPLATES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">IP-Adresse (optional)</label>
                  <input className="input" value={form.ipAddress} placeholder="192.168.1.100"
                    onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} />
                </div>
                <div>
                  <label className="label">Node (optional)</label>
                  <select className="input" value={form.nodeId}
                    onChange={(e) => setForm({ ...form, nodeId: e.target.value })}>
                    <option value="">Automatisch</option>
                    {nodes?.filter((n) => n.state === 'online').map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Beschreibung (optional)</label>
                <input className="input" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {formErr && <p className="text-sm text-red-500">{formErr}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn-primary flex-1" disabled={create.isPending} onClick={handleCreate}>
                Erstellen
              </button>
              <button className="btn-secondary" onClick={() => { setShowCreate(false); setFormErr(''); }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
              </th>
              <th>Name</th><th>Status</th><th>Node</th><th>OS</th><th>IP</th><th>Ressourcen</th><th>Tags</th><th>Besitzer</th><th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="text-center text-slate-400">Lade…</td></tr>
            )}
            {filtered.map((ct) => (
              <tr key={ct.id}
                className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${selected.has(ct.id) ? 'bg-brand-50/50 dark:bg-brand-500/5' : ''}`}>
                <td>
                  <input type="checkbox" checked={selected.has(ct.id)} onChange={() => toggleOne(ct.id)}
                    className="rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
                </td>
                <td><Link className="font-medium text-brand-500 hover:underline" to={`/containers/${ct.id}`}>{ct.name}</Link></td>
                <td><StatusBadge status={ct.state} /></td>
                <td>{ct.node.name}</td>
                <td className="text-xs">{ct.osTemplate}</td>
                <td className="font-mono text-xs">{ct.ipAddress ?? '—'}</td>
                <td className="text-xs">{ct.vcpus} vCPU · {ct.memoryMb >= 1024 ? `${(ct.memoryMb / 1024).toFixed(1)} GiB` : `${ct.memoryMb} MiB`} · {ct.diskGb} GB</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {ct.tags?.map((t) => (
                      <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">{t}</span>
                    ))}
                  </div>
                </td>
                <td>{ct.owner.name}</td>
                <td className="space-x-1 text-right">
                  {can('vm.power') && ct.state === 'stopped' && (
                    <button className="btn-secondary text-xs"
                      onClick={() => action.mutate({ path: `/containers/${ct.id}/start` })}>Start</button>
                  )}
                  {can('vm.power') && ct.state === 'running' && (
                    <button className="btn-secondary text-xs"
                      onClick={() => action.mutate({ path: `/containers/${ct.id}/stop` })}>Stop</button>
                  )}
                  {can('vm.delete') && (
                    <button className="btn-danger text-xs"
                      onClick={() => {
                        if (confirm(`Container "${ct.name}" löschen?`)) {
                          action.mutate({ path: `/containers/${ct.id}`, method: 'DELETE' });
                        }
                      }}>
                      Löschen
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && !filtered.length && (
              <tr><td colSpan={10} className="text-center text-slate-400">
                {containers?.length ? 'Keine Treffer für den aktuellen Filter' : 'Keine Container vorhanden'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
