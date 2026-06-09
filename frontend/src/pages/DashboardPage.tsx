import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Node, Vm } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ? 'text-brand-500' : ''}`}>{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { can } = useAuth();
  const { data: vms } = useQuery({ queryKey: ['vms'], queryFn: () => api<Vm[]>('/vms') });
  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
    enabled: can('node.read'),
  });

  const running = vms?.filter((v) => v.state === 'running').length ?? 0;
  const online = nodes?.filter((n) => n.state === 'online').length ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="VMs gesamt" value={vms?.length ?? '—'} />
        <Stat label="VMs laufend" value={running} accent />
        {can('node.read') && <Stat label="Nodes" value={nodes?.length ?? '—'} />}
        {can('node.read') && <Stat label="Nodes online" value={online} accent />}
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Neueste VMs</h2>
          <Link to="/vms" className="text-sm text-brand-500 hover:underline">Alle anzeigen →</Link>
        </div>
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Status</th><th>Node</th><th>Ressourcen</th></tr>
          </thead>
          <tbody>
            {vms?.slice(0, 5).map((vm) => (
              <tr key={vm.id}>
                <td><Link className="font-medium text-brand-500 hover:underline" to={`/vms/${vm.id}`}>{vm.name}</Link></td>
                <td><StatusBadge status={vm.state} /></td>
                <td>{vm.node.name}</td>
                <td>{vm.vcpus} vCPU · {(vm.memoryMb / 1024).toFixed(1)} GiB</td>
              </tr>
            ))}
            {!vms?.length && (
              <tr><td colSpan={4} className="text-center text-slate-400">Noch keine VMs</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
