import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Vm } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function VmListPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { data: vms, isLoading } = useQuery({ queryKey: ['vms'], queryFn: () => api<Vm[]>('/vms') });

  const power = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' }) =>
      api(`/vms/${id}/${action}`, { method: 'POST', body: {} }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['vms'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Virtual Machines</h1>
        {can('vm.create') && (
          <Link to="/vms/new" className="btn-primary">+ Neue VM</Link>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Status</th><th>Node</th><th>IP</th><th>Ressourcen</th><th>Besitzer</th><th></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="text-center text-slate-400">Lade…</td></tr>}
            {vms?.map((vm) => (
              <tr key={vm.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td><Link className="font-medium text-brand-500 hover:underline" to={`/vms/${vm.id}`}>{vm.name}</Link></td>
                <td><StatusBadge status={vm.state} /></td>
                <td>{vm.node.name}</td>
                <td className="font-mono text-xs">{vm.nics[0]?.ips[0]?.address ?? '—'}</td>
                <td>{vm.vcpus} vCPU · {(vm.memoryMb / 1024).toFixed(1)} GiB</td>
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
            {!isLoading && !vms?.length && (
              <tr><td colSpan={7} className="text-center text-slate-400">Keine VMs vorhanden</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
