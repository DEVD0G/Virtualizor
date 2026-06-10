import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Backup, BackupSchedule, FirewallRule, Snapshot, Vm } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';
import VncConsole from '../components/VncConsole';

export default function VmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [snapName, setSnapName] = useState('');
  const [consoleWsUrl, setConsoleWsUrl] = useState<string | null>(null);
  const [showResize, setShowResize] = useState(false);
  const [resizeForm, setResizeForm] = useState({ vcpus: '', memoryMb: '' });
  const [scheduleForm, setScheduleForm] = useState({ intervalHours: '24', targetDir: '' });
  const [fwForm, setFwForm] = useState({
    direction: 'in' as 'in' | 'out',
    action: 'accept' as 'accept' | 'drop',
    protocol: 'tcp',
    portFrom: '',
    portTo: '',
    cidr: '0.0.0.0/0',
    priority: '100',
  });

  const { data: vm } = useQuery({
    queryKey: ['vms', id],
    queryFn: () => api<Vm>(`/vms/${id}`),
    refetchInterval: 10_000,
  });
  const { data: snapshots } = useQuery({
    queryKey: ['vms', id, 'snapshots'],
    queryFn: () => api<Snapshot[]>(`/vms/${id}/snapshots`),
  });
  const { data: backups } = useQuery({
    queryKey: ['vms', id, 'backups'],
    queryFn: () => api<Backup[]>(`/vms/${id}/backups`),
    enabled: can('backup.read'),
    refetchInterval: 15_000,
  });
  const { data: firewallRules } = useQuery({
    queryKey: ['vms', id, 'firewall'],
    queryFn: () => api<FirewallRule[]>(`/vms/${id}/firewall`),
    enabled: can('vm.firewall'),
  });
  const { data: schedules } = useQuery({
    queryKey: ['vms', id, 'backup-schedules'],
    queryFn: () => api<BackupSchedule[]>(`/vms/${id}/backup-schedules`),
    enabled: can('backup.read'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vms'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'snapshots'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'backups'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'firewall'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'backup-schedules'] });
  };

  const action = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method?: string; body?: unknown }) =>
      api(path, { method: method ?? 'POST', body: body ?? {} }),
    onSettled: invalidate,
  });

  async function openConsole() {
    const { token, wsUrl } = await api<{ token: string; wsUrl: string; expiresIn: number }>(
      `/vms/${vm!.id}/console`,
    );
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    setConsoleWsUrl(`${proto}://${window.location.host}${wsUrl}?token=${token}`);
  }

  if (!vm) return <div className="text-slate-400">Lade…</div>;

  return (
    <>
      {consoleWsUrl && (
        <VncConsole wsUrl={consoleWsUrl} onClose={() => setConsoleWsUrl(null)} />
      )}
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{vm.name}</h1>
          <StatusBadge status={vm.state} />
        </div>
        <div className="flex gap-2">
          {can('vm.console') && vm.state === 'running' && (
            <button className="btn-secondary" onClick={openConsole}>Konsole</button>
          )}
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Konfiguration</h2>
            {can('vm.create') && vm.state === 'stopped' && (
              <button className="btn-secondary text-xs" onClick={() => {
                setResizeForm({ vcpus: String(vm.vcpus), memoryMb: String(vm.memoryMb) });
                setShowResize(!showResize);
              }}>
                {showResize ? 'Abbrechen' : 'Resize'}
              </button>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">vCPUs</dt><dd>{vm.vcpus}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">RAM</dt><dd>{(vm.memoryMb / 1024).toFixed(1)} GiB</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Node</dt><dd>{vm.node.name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Besitzer</dt><dd>{vm.owner.name} ({vm.owner.email})</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Erstellt</dt><dd>{new Date(vm.createdAt).toLocaleString()}</dd></div>
          </dl>
          {showResize && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">vCPUs</label>
                  <input className="input" type="number" min="1" max="128" value={resizeForm.vcpus}
                    onChange={(e) => setResizeForm({ ...resizeForm, vcpus: e.target.value })} />
                </div>
                <div>
                  <label className="label">RAM (MiB)</label>
                  <input className="input" type="number" min="256" step="256" value={resizeForm.memoryMb}
                    onChange={(e) => setResizeForm({ ...resizeForm, memoryMb: e.target.value })} />
                </div>
              </div>
              <button className="btn-primary w-full" onClick={() => {
                action.mutate({
                  path: `/vms/${vm.id}`,
                  method: 'PATCH',
                  body: { vcpus: parseInt(resizeForm.vcpus), memoryMb: parseInt(resizeForm.memoryMb) },
                });
                setShowResize(false);
              }}>
                Resize anwenden
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Disks & Netzwerk</h2>
          <ul className="space-y-2 text-sm">
            {vm.disks.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span className="text-slate-500">{d.name}</span>
                <span className="flex-1">{d.sizeGb} GB · {d.storagePool.name} ({d.storagePool.type})</span>
                {can('vm.create') && vm.state === 'stopped' && (
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => {
                      const n = prompt(`Neue Größe für ${d.name} (GB, aktuell ${d.sizeGb})`);
                      if (!n) return;
                      const newSize = parseInt(n);
                      if (isNaN(newSize) || newSize <= d.sizeGb) return alert('Neue Größe muss größer als aktuell sein');
                      action.mutate({ path: `/vms/${vm.id}/disks/${d.id}`, method: 'PATCH', body: { newSizeGb: newSize } });
                    }}
                  >
                    Resize
                  </button>
                )}
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

      {can('backup.read') && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Backups</h2>
          {can('backup.manage') && (
            <div className="mb-4">
              <button
                className="btn-secondary"
                disabled={action.isPending}
                onClick={() => action.mutate({ path: `/vms/${vm.id}/backups`, body: {} })}
              >
                Backup erstellen
              </button>
            </div>
          )}
          <table className="table-base">
            <thead><tr><th>Erstellt</th><th>Ziel</th><th>Größe</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {backups?.map((b) => (
                <tr key={b.id}>
                  <td>{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="font-mono text-xs max-w-[200px] truncate">{b.target}</td>
                  <td>{b.sizeBytes ? `${(Number(b.sizeBytes) / 1024 / 1024).toFixed(0)} MB` : '—'}</td>
                  <td>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      b.state === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                      : b.state === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    }`}>{b.state}</span>
                  </td>
                  <td className="text-right">
                    {can('backup.manage') && (
                      <button className="btn-danger text-xs"
                        onClick={() => action.mutate({ path: `/vms/${vm.id}/backups/${b.id}`, method: 'DELETE' })}>
                        Löschen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!backups?.length && <tr><td colSpan={5} className="text-center text-slate-400">Keine Backups</td></tr>}
            </tbody>
          </table>

          {/* Backup Schedules */}
          <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-semibold">Geplante Backups</h3>
            {can('backup.manage') && (
              <div className="mb-3 flex flex-wrap gap-2">
                <input
                  className="input w-28"
                  type="number"
                  min="1"
                  max="8760"
                  placeholder="Intervall (h)"
                  value={scheduleForm.intervalHours}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, intervalHours: e.target.value })}
                />
                <input
                  className="input w-52"
                  placeholder="Zielverzeichnis (optional)"
                  value={scheduleForm.targetDir}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, targetDir: e.target.value })}
                />
                <button
                  className="btn-secondary text-sm"
                  onClick={() => {
                    const h = parseInt(scheduleForm.intervalHours);
                    if (!h || h < 1) return;
                    action.mutate({
                      path: `/vms/${vm.id}/backup-schedules`,
                      body: { intervalHours: h, ...(scheduleForm.targetDir ? { targetDir: scheduleForm.targetDir } : {}) },
                    });
                  }}
                >
                  Zeitplan hinzufügen
                </button>
              </div>
            )}
            {schedules?.length ? (
              <table className="table-base text-sm">
                <thead><tr><th>Intervall</th><th>Letzter Lauf</th><th>Nächster Lauf</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id}>
                      <td>alle {s.intervalHours} h</td>
                      <td className="text-xs">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '—'}</td>
                      <td className="text-xs">{s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '—'}</td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                          {s.enabled ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </td>
                      {can('backup.manage') && (
                        <td className="space-x-1 text-right">
                          <button className="btn-secondary text-xs"
                            onClick={() => action.mutate({ path: `/vms/${vm.id}/backup-schedules/${s.id}`, method: 'PATCH', body: { enabled: !s.enabled } })}>
                            {s.enabled ? 'Deaktivieren' : 'Aktivieren'}
                          </button>
                          <button className="btn-danger text-xs"
                            onClick={() => action.mutate({ path: `/vms/${vm.id}/backup-schedules/${s.id}`, method: 'DELETE' })}>
                            Löschen
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-400">Keine Zeitpläne konfiguriert</p>
            )}
          </div>
        </div>
      )}

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

      {can('vm.firewall') && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Firewall</h2>
          <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
            <select className="input" value={fwForm.direction} onChange={(e) => setFwForm({ ...fwForm, direction: e.target.value as 'in' | 'out' })}>
              <option value="in">Eingehend</option>
              <option value="out">Ausgehend</option>
            </select>
            <select className="input" value={fwForm.action} onChange={(e) => setFwForm({ ...fwForm, action: e.target.value as 'accept' | 'drop' })}>
              <option value="accept">Erlauben</option>
              <option value="drop">Blockieren</option>
            </select>
            <select className="input" value={fwForm.protocol} onChange={(e) => setFwForm({ ...fwForm, protocol: e.target.value })}>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
              <option value="icmp">ICMP</option>
              <option value="any">Alle</option>
            </select>
            <input className="input" placeholder="Port von" type="number" value={fwForm.portFrom}
              onChange={(e) => setFwForm({ ...fwForm, portFrom: e.target.value })} />
            <input className="input" placeholder="Port bis" type="number" value={fwForm.portTo}
              onChange={(e) => setFwForm({ ...fwForm, portTo: e.target.value })} />
            <input className="input" placeholder="CIDR" value={fwForm.cidr}
              onChange={(e) => setFwForm({ ...fwForm, cidr: e.target.value })} />
            <button className="btn-primary" onClick={() => {
              action.mutate({
                path: `/vms/${vm.id}/firewall`,
                body: {
                  direction: fwForm.direction,
                  action: fwForm.action,
                  protocol: fwForm.protocol,
                  ...(fwForm.portFrom ? { portFrom: parseInt(fwForm.portFrom) } : {}),
                  ...(fwForm.portTo ? { portTo: parseInt(fwForm.portTo) } : {}),
                  cidr: fwForm.cidr || '0.0.0.0/0',
                  priority: parseInt(fwForm.priority) || 100,
                },
              });
            }}>
              Regel hinzufügen
            </button>
          </div>
          <table className="table-base">
            <thead><tr><th>Richtung</th><th>Aktion</th><th>Protokoll</th><th>Ports</th><th>CIDR</th><th>Priorität</th><th></th></tr></thead>
            <tbody>
              {firewallRules?.map((r) => (
                <tr key={r.id}>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.direction === 'in' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'}`}>{r.direction === 'in' ? '↓ Ein' : '↑ Aus'}</span></td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.action === 'accept' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>{r.action === 'accept' ? 'Erlaubt' : 'Geblockt'}</span></td>
                  <td className="uppercase text-xs font-mono">{r.protocol}</td>
                  <td className="text-xs">{r.portFrom ? `${r.portFrom}${r.portTo && r.portTo !== r.portFrom ? `–${r.portTo}` : ''}` : '—'}</td>
                  <td className="font-mono text-xs">{r.cidr}</td>
                  <td>{r.priority}</td>
                  <td className="text-right">
                    <button className="btn-danger text-xs"
                      onClick={() => action.mutate({ path: `/vms/${vm.id}/firewall/${r.id}`, method: 'DELETE' })}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
              {!firewallRules?.length && <tr><td colSpan={7} className="text-center text-slate-400">Keine Regeln</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}
