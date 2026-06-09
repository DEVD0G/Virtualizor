import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Snapshot, Vm } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function VmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [snapName, setSnapName] = useState('');

  const { data: vm } = useQuery({
    queryKey: ['vms', id],
    queryFn: () => api<Vm>(`/vms/${id}`),
    refetchInterval: 10_000,
  });
  const { data: snapshots } = useQuery({
    queryKey: ['vms', id, 'snapshots'],
    queryFn: () => api<Snapshot[]>(`/vms/${id}/snapshots`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vms'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'snapshots'] });
  };

  const action = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method?: string; body?: unknown }) =>
      api(path, { method: method ?? 'POST', body: body ?? {} }),
    onSettled: invalidate,
  });

  if (!vm) return <div className="text-slate-400">Lade…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{vm.name}</h1>
          <StatusBadge status={vm.state} />
        </div>
        <div className="flex gap-2">
          {can('vm.power') && vm.state === 'stopped' && (
            <button className="btn-primary" onClick={() => action.mutate({ path: `/vms/${vm.id}/start` })}>Start</button>
          )}
          {can('vm.power') && vm.state === 'running' && (
            <>
              <button className="btn-secondary" onClick={() => action.mutate({ path: `/vms/${vm.id}/restart` })}>Restart</button>
              <button className="btn-secondary" onClick={() => action.mutate({ path: `/vms/${vm.id}/stop` })}>Stop</button>
            </>
          )}
          {can('vm.delete') && (
            <button
              className="btn-danger"
              onClick={() => {
                if (confirm(`VM "${vm.name}" inklusive aller Disks löschen?`)) {
                  action.mutate({ path: `/vms/${vm.id}`, method: 'DELETE' });
                  navigate('/vms');
                }
              }}
            >
              Löschen
            </button>
          )}
        </div>
      </div>

      {vm.errorMsg && (
        <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">{vm.errorMsg}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Konfiguration</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">vCPUs</dt><dd>{vm.vcpus}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">RAM</dt><dd>{(vm.memoryMb / 1024).toFixed(1)} GiB</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Node</dt><dd>{vm.node.name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Besitzer</dt><dd>{vm.owner.name} ({vm.owner.email})</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Erstellt</dt><dd>{new Date(vm.createdAt).toLocaleString()}</dd></div>
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Disks & Netzwerk</h2>
          <ul className="space-y-2 text-sm">
            {vm.disks.map((d) => (
              <li key={d.id} className="flex justify-between">
                <span className="text-slate-500">{d.name}</span>
                <span>{d.sizeGb} GB · {d.storagePool.name} ({d.storagePool.type})</span>
              </li>
            ))}
            {vm.nics.map((n) => (
              <li key={n.id} className="flex justify-between">
                <span className="text-slate-500">{n.network.name}</span>
                <span className="font-mono text-xs">
                  {n.mac} {n.ips[0] ? `· ${n.ips[0].address}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {can('vm.snapshot') && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Snapshots</h2>
          <div className="mb-4 flex gap-2">
            <input
              className="input max-w-xs"
              placeholder="snapshot-name"
              value={snapName}
              onChange={(e) => setSnapName(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={!/^[a-z0-9][a-z0-9-]{1,62}$/.test(snapName)}
              onClick={() => {
                action.mutate({ path: `/vms/${vm.id}/snapshots`, body: { name: snapName } });
                setSnapName('');
              }}
            >
              Snapshot erstellen
            </button>
          </div>
          <table className="table-base">
            <thead><tr><th>Name</th><th>Erstellt</th><th></th></tr></thead>
            <tbody>
              {snapshots?.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.name}</td>
                  <td>{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="space-x-2 text-right">
                    <button className="btn-secondary" onClick={() => action.mutate({ path: `/vms/${vm.id}/snapshots/${s.id}/revert` })}>Revert</button>
                    <button className="btn-danger" onClick={() => action.mutate({ path: `/vms/${vm.id}/snapshots/${s.id}`, method: 'DELETE' })}>Löschen</button>
                  </td>
                </tr>
              ))}
              {!snapshots?.length && <tr><td colSpan={3} className="text-center text-slate-400">Keine Snapshots</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
