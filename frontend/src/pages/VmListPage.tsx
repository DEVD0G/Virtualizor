import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Node, Vm } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

const VM_STATES = ['provisioning', 'stopped', 'running', 'paused', 'error', 'deleting'] as const;

export default function VmListPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  const { data: vms, isLoading } = useQuery({ queryKey: ['vms'], queryFn: () => api<Vm[]>('/vms') });
  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
    enabled: can('node.read'),
  });

  const power = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' }) =>
      api(`/vms/${id}/${action}`, { method: 'POST', body: {} }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['vms'] }),
  });

  const filtered = useMemo(() => {
    if (!vms) return [];
    return vms.filter((vm) => {
      if (search && !vm.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (stateFilter && vm.state !== stateFilter) return false;
      if (nodeFilter && vm.node.id !== nodeFilter) return false;
      if (tagFilter && !(vm.tags ?? []).some((t) => t.toLowerCase().includes(tagFilter.toLowerCase()))) return false;
      return true;
    });
  }, [vms, search, stateFilter, nodeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Virtual Machines</h1>
        {can('vm.create') && (
          <Link to="/vms/new" className="btn-primary">+ Neue VM</Link>
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
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="input w-40"
        >
          <option value="">Alle Status</option>
          {VM_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {can('node.read') && nodes && (
          <select
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            className="input w-44"
          >
            <option value="">Alle Nodes</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          placeholder="Tag filtern…"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="input w-36"
        />
        {(search || stateFilter || nodeFilter || tagFilter) && (
          <button
            className="btn-secondary"
            onClick={() => { setSearch(''); setStateFilter(''); setNodeFilter(''); setTagFilter(''); }}
          >
            Filter zurücksetzen
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500 self-center">
          {filtered.length}{(search || stateFilter || nodeFilter || tagFilter) ? ` von ${vms?.length ?? 0}` : ''} VMs
        </span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Status</th><th>Node</th><th>IP</th><th>Ressourcen</th><th>Tags</th><th>Besitzer</th><th></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center text-slate-400">Lade…</td></tr>}
            {filtered.map((vm) => (
              <tr key={vm.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td><Link className="font-medium text-brand-500 hover:underline" to={`/vms/${vm.id}`}>{vm.name}</Link></td>
                <td><StatusBadge status={vm.state} /></td>
                <td>{vm.node.name}</td>
                <td className="font-mono text-xs">{vm.nics[0]?.ips[0]?.address ?? '—'}</td>
                <td>{vm.vcpus} vCPU · {(vm.memoryMb / 1024).toFixed(1)} GiB</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {vm.tags?.map((t) => (
                      <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">{t}</span>
                    ))}
                  </div>
                </td>
                <td>{vm.owner.name}</td>
                <td className="text-right">
                  {can('vm.power') && vm.state === 'stopped' && (
                    <button className="btn-secondary" onClick={() => power.mutate({ id: vm.id, action: 'start' })}>Start</button>
                  )}
                  {can('vm.power') && vm.state === 'running' && (
                    <button className="btn-secondary" onClick={() => power.mutate({ id: vm.id, action: 'stop' })}>Stop</button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && !filtered.length && (
              <tr><td colSpan={8} className="text-center text-slate-400">
                {vms?.length ? 'Keine Treffer für den aktuellen Filter' : 'Keine VMs vorhanden'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
