import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Container, Node } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

const CT_STATES = ['provisioning', 'stopped', 'running', 'error', 'deleting'] as const;

export default function ContainersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();

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

  const action = useMutation({
    mutationFn: ({ path, method }: { path: string; method?: string }) =>
      api(path, { method: method ?? 'POST', body: {} }),
    onSettled: invalidate,
  });

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
          <Link to="/containers/new" className="btn-primary">+ Neuer Container</Link>
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
        <span className="ml-auto self-center text-sm" style={{ color: 'var(--tx-2)' }}>
          {filtered.length}{hasFilter ? ` von ${containers?.length ?? 0}` : ''} Container
        </span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-2.5"
          style={{ background: 'var(--brand-sub)', border: '1px solid var(--brand-ring)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--brand)' }}>
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
          <button className="ml-auto text-xs hover:underline" style={{ color: 'var(--tx-3)' }}
            onClick={() => setSelected(new Set())}>
            Auswahl aufheben
          </button>
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
              <tr><td colSpan={10} className="text-center" style={{ color: 'var(--tx-3)' }}>Lade…</td></tr>
            )}
            {filtered.map((ct) => (
              <tr key={ct.id} style={selected.has(ct.id) ? { background: 'var(--brand-sub)' } : undefined}>
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
                      <span key={t} className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--surface-3)', color: 'var(--tx-2)' }}>{t}</span>
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
              <tr><td colSpan={10} className="text-center" style={{ color: 'var(--tx-3)' }}>
                {containers?.length ? 'Keine Treffer für den aktuellen Filter' : 'Keine Container vorhanden'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
