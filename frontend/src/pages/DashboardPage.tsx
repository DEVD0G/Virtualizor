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
      <div className="text-sm" style={{ color: 'var(--tx-2)' }}>{label}</div>
      <div
        className="mt-1 text-3xl font-semibold"
        style={{ color: accent ? 'var(--brand)' : 'var(--tx-1)' }}
      >
        {value}
      </div>
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
  const barColor = (pct: number) => pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';

  return (
    <Link to={`/nodes/${node.id}`} className="card block space-y-3 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--tx-1)' }}>{node.name}</span>
        <span className="text-xs" style={{ color: 'var(--tx-3)' }}>{node._count?.vms ?? 0} VMs</span>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex justify-between text-xs" style={{ color: 'var(--tx-2)' }}>
            <span>CPU ({node.cpuCores} Cores)</span>
            <span>{cpuPct.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full" style={{ background: 'var(--border)' }}>
              <div
                className="h-1 rounded-full transition-all"
                style={{ width: `${Math.min(cpuPct, 100)}%`, background: barColor(cpuPct) }}
              />
            </div>
            {cpuData.length >= 2 && <Sparkline data={cpuData} width={60} height={20} max={100} color="var(--brand)" />}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs" style={{ color: 'var(--tx-2)' }}>
            <span>RAM ({(node.memoryMb / 1024).toFixed(0)} GiB)</span>
            <span>{ramPct.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full" style={{ background: 'var(--border)' }}>
              <div
                className="h-1 rounded-full transition-all"
                style={{ width: `${Math.min(ramPct, 100)}%`, background: barColor(ramPct) }}
              />
            </div>
            {ramData.length >= 2 && <Sparkline data={ramData} width={60} height={20} max={100} color="#22c55e" />}
          </div>
        </div>
      </div>
    </Link>
  );
}

const taskStateColors: Record<string, string> = {
  queued:    'bg-slate-400/15 text-slate-600 dark:text-slate-400',
  running:   'bg-[var(--brand-sub)] text-[var(--brand)]',
  succeeded: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  failed:    'bg-red-500/15 text-red-600 dark:text-red-400',
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
        <div
          className="card"
          style={{ borderColor: 'var(--brand-ring)', background: 'linear-gradient(135deg, var(--brand-sub) 0%, var(--surface) 100%)' }}
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="text-2xl" style={{ color: 'var(--brand)' }}>✦</span>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--tx-1)' }}>Was möchtest du tun?</h2>
              <p className="text-xs" style={{ color: 'var(--tx-2)' }}>
                Beschreibe dein Ziel — der KI-Assistent hilft dir Schritt für Schritt.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder='z.B. "Erstelle einen neuen Webserver" oder "Warum ist meine VM langsam?"'
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && openAi()}
            />
            <button className="btn-primary" onClick={() => openAi()}>Fragen</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Neuen Server erstellen', 'Ressourcenauslastung prüfen', 'Backup einrichten'].map((s) => (
              <button
                key={s}
                onClick={() => openAi(s)}
                className="rounded-full px-3 py-1 text-xs transition-colors"
                style={{
                  border: '1px solid var(--brand-ring)',
                  color: 'var(--brand)',
                  background: 'transparent',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--brand-sub)'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
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
          <h2 className="section-title mb-3">Node-Auslastung</h2>
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
            <h2 className="font-semibold" style={{ color: 'var(--tx-1)' }}>Neueste VMs</h2>
            <Link to="/vms" className="text-sm hover:underline" style={{ color: 'var(--brand)' }}>Alle anzeigen →</Link>
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
            <h2 className="font-semibold" style={{ color: 'var(--tx-1)' }}>Neueste Container</h2>
            <Link to="/containers" className="text-sm hover:underline" style={{ color: 'var(--brand)' }}>Alle anzeigen →</Link>
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
            <h2 className="font-semibold" style={{ color: 'var(--tx-1)' }}>Letzte Jobs</h2>
            <Link to="/tasks" className="text-sm hover:underline" style={{ color: 'var(--brand)' }}>Alle anzeigen →</Link>
          </div>
          <div className="space-y-2">
            {recentTasks?.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="w-32 truncate font-mono text-xs" style={{ color: 'var(--tx-3)' }}>{t.kind}</span>
                <span className="flex-1 truncate text-xs" style={{ color: 'var(--tx-2)' }}>
                  {t.resourceType}/{t.resourceId.slice(0, 8)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${taskStateColors[t.state] ?? ''}`}>
                  {t.state}
                </span>
              </div>
            ))}
            {!recentTasks?.length && (
              <p className="text-center text-sm" style={{ color: 'var(--tx-3)' }}>Keine Jobs</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
