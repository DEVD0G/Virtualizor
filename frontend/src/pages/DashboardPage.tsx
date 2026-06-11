import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Container, MetricSample, Node, Task, Vm } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useUiMode } from '../contexts/UiModeContext';
import Sparkline from '../components/Sparkline';
import StatusBadge from '../components/StatusBadge';

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${accent ? 'text-brand-500' : ''}`}>{value}</div>
    </div>
  );
}


function NodeCard({ node }: { node: Node }) {
  const { data: metrics = [] } = useQuery({
    queryKey: ['nodes', node.id, 'metrics', 1],
    queryFn: () => api<MetricSample[]>(`/nodes/${node.id}/metrics?hours=1`),
    refetchInterval: 60_000,
  });
  const cpuPct = node.cpuUsage ?? 0;
  const ramPct = node.memoryMb > 0 ? ((node.memUsedMb ?? 0) / node.memoryMb) * 100 : 0;
  const cpuData = metrics.map((m) => m.cpuPercent);
  const ramData = metrics.map((m) => node.memoryMb > 0 ? (m.memUsedMb / node.memoryMb) * 100 : 0);
  const barColor = (pct: number) => pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <Link to={`/nodes/${node.id}`} className="card block space-y-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{node.name}</span>
        <span className="text-xs text-slate-500">{node._count?.vms ?? 0} VMs</span>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>CPU ({node.cpuCores} Cores)</span>
            <span>{cpuPct.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
              <div className={`h-1 rounded-full ${barColor(cpuPct)}`} style={{ width: `${Math.min(cpuPct, 100)}%` }} />
            </div>
            {cpuData.length >= 2 && <Sparkline data={cpuData} width={60} height={20} max={100} color="#6366f1" />}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>RAM ({(node.memoryMb / 1024).toFixed(0)} GiB)</span>
            <span>{ramPct.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
              <div className={`h-1 rounded-full ${barColor(ramPct)}`} style={{ width: `${Math.min(ramPct, 100)}%` }} />
            </div>
            {ramData.length >= 2 && <Sparkline data={ramData} width={60} height={20} max={100} color="#10b981" />}
          </div>
        </div>
      </div>
    </Link>
  );
}

const taskStateColors: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  succeeded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export default function DashboardPage() {
  const { can } = useAuth();
  const { isAssisted } = useUiMode();
  const [aiInput, setAiInput] = useState('');
  const { data: vms } = useQuery({ queryKey: ['vms'], queryFn: () => api<Vm[]>('/vms') });
  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
    enabled: can('node.read'),
    refetchInterval: 30_000,
  });
  const { data: containers } = useQuery({
    queryKey: ['containers'],
    queryFn: () => api<Container[]>('/containers'),
    enabled: can('vm.read'),
    refetchInterval: 30_000,
  });
  const { data: recentTasks } = useQuery({
    queryKey: ['tasks', 'recent'],
    queryFn: () => api<Task[]>('/tasks?limit=10'),
    enabled: can('node.read'),
    refetchInterval: 10_000,
  });

  const running = vms?.filter((v) => v.state === 'running').length ?? 0;
  const online  = nodes?.filter((n) => n.state === 'online').length ?? 0;
  const ctRunning = containers?.filter((c) => c.state === 'running').length ?? 0;

  function openAi(text?: string) {
    window.dispatchEvent(new CustomEvent('vcp:ai:open', { detail: { prompt: text ?? aiInput } }));
    setAiInput('');
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {isAssisted && (
        <div className="card bg-gradient-to-br from-brand-50 to-white dark:from-brand-500/10 dark:to-slate-900 border-brand-200 dark:border-brand-500/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">✦</span>
            <div>
              <h2 className="font-semibold">Was möchtest du tun?</h2>
              <p className="text-xs text-slate-500">Beschreibe dein Ziel — der KI-Assistent hilft dir Schritt für Schritt.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={'z.B. "Erstelle einen neuen Webserver" oder "Warum ist meine VM langsam?"'}
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && openAi()}
            />
            <button className="btn-primary" onClick={() => openAi()}>Fragen</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Neuen Server erstellen', 'Ressourcenauslastung prüfen', 'Backup einrichten'].map((s) => (
              <button key={s} onClick={() => openAi(s)} className="rounded-full border border-brand-200 px-3 py-1 text-xs text-brand-600 hover:bg-brand-100 dark:border-brand-500/40 dark:text-brand-400 dark:hover:bg-brand-500/20 transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="VMs gesamt" value={vms?.length ?? '—'} />
        <Stat label="VMs laufend" value={running} accent />
        {can('node.read') && <Stat label="Nodes" value={nodes?.length ?? '—'} />}
        {can('node.read') && <Stat label="Nodes online" value={online} accent />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Container gesamt" value={containers?.length ?? '—'} />
        <Stat label="Container laufend" value={ctRunning} accent />
      </div>

      {/* Node utilisation cards */}
      {can('node.read') && nodes && nodes.filter((n) => n.state === 'online').length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Node-Auslastung
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nodes.filter((n) => n.state === 'online').map((n) => (
              <NodeCard key={n.id} node={n} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent VMs */}
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

        {/* Recent Containers */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Neueste Container</h2>
            <Link to="/containers" className="text-sm text-brand-500 hover:underline">Alle anzeigen →</Link>
          </div>
          <table className="table-base">
            <thead>
              <tr><th>Name</th><th>Status</th><th>Node</th><th>Ressourcen</th></tr>
            </thead>
            <tbody>
              {containers?.slice(0, 5).map((ct) => (
                <tr key={ct.id}>
                  <td><Link className="font-medium text-brand-500 hover:underline" to={`/containers/${ct.id}`}>{ct.name}</Link></td>
                  <td><StatusBadge status={ct.state} /></td>
                  <td>{ct.node.name}</td>
                  <td>{ct.vcpus} vCPU · {(ct.memoryMb / 1024).toFixed(1)} GiB</td>
                </tr>
              ))}
              {!containers?.length && (
                <tr><td colSpan={4} className="text-center text-slate-400">Noch keine Container</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Tasks */}
      {can('node.read') && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Letzte Jobs</h2>
            <Link to="/tasks" className="text-sm text-brand-500 hover:underline">Alle anzeigen →</Link>
          </div>
          <div className="space-y-2">
            {recentTasks?.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs text-slate-500 w-32 truncate">{t.kind}</span>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300 text-xs">
                  {t.resourceType}/{t.resourceId.slice(0, 8)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${taskStateColors[t.state] ?? ''}`}>
                  {t.state}
                </span>
              </div>
            ))}
            {!recentTasks?.length && (
              <p className="text-center text-slate-400 text-sm">Keine Jobs</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
