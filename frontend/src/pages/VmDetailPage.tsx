import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Backup, BackupSchedule, FirewallRule, Iso, Network, Node, NodePciDevice, PciPassthrough, Snapshot, Vm } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import AiDiagnoseCard from '../components/AiDiagnoseCard';
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
  const [showMeta, setShowMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ description: '', tags: '' });
  const [showClone, setShowClone] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [showMigrate, setShowMigrate] = useState(false);
  const [migrateNodeId, setMigrateNodeId] = useState('');
  const [scheduleForm, setScheduleForm] = useState({ intervalHours: '24', targetDir: '' });
  const [showAddNic, setShowAddNic] = useState(false);
  const [addNicNetworkId, setAddNicNetworkId] = useState('');
  const [addNicPoolId, setAddNicPoolId] = useState('');
  const [fwForm, setFwForm] = useState({
    direction: 'in' as 'in' | 'out',
    action: 'accept' as 'accept' | 'drop',
    protocol: 'tcp',
    portFrom: '',
    portTo: '',
    cidr: '0.0.0.0/0',
    priority: '100',
  });
  const [showAddPci, setShowAddPci] = useState(false);
  const [selectedPciAddr, setSelectedPciAddr] = useState('');

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
  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
    enabled: can('node.read') && showMigrate,
  });
  const { data: isos } = useQuery({
    queryKey: ['storage', 'isos'],
    queryFn: () => api<Iso[]>('/storage/isos'),
    enabled: can('vm.manage'),
  });
  const { data: networks } = useQuery({
    queryKey: ['networks'],
    queryFn: () => api<Network[]>('/networks'),
    enabled: can('vm.manage'),
  });
  const { data: pciDevices } = useQuery({
    queryKey: ['vms', id, 'pci'],
    queryFn: () => api<PciPassthrough[]>(`/vms/${id}/pci`),
    enabled: can('vm.manage'),
  });
  const { data: nodePciDevices } = useQuery({
    queryKey: ['nodes', vm?.node.id, 'pci-devices'],
    queryFn: () => api<{ devices: NodePciDevice[] }>(`/nodes/${vm!.node.id}/pci-devices`),
    enabled: can('node.read') && showAddPci && !!vm,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vms'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'snapshots'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'backups'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'firewall'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'backup-schedules'] });
    queryClient.invalidateQueries({ queryKey: ['vms', id, 'pci'] });
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

  if (!vm) return <div style={{ color: 'var(--tx-3)' }}>Lade…</div>;

  return (
    <>
      {consoleWsUrl && (
        <VncConsole wsUrl={consoleWsUrl} onClose={() => setConsoleWsUrl(null)} />
      )}
      {showClone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl p-6 shadow-xl" style={{ background: 'var(--surface)' }}>
            <h3 className="mb-4 text-lg font-semibold">VM klonen</h3>
            <label className="label">Name der neuen VM</label>
            <input
              className="input mb-4"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value.replace(/[^a-z0-9-]/g, ''))}
              pattern="[a-z0-9][-a-z0-9]{2,62}"
              placeholder="neue-vm-name"
            />
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={!/^[a-z0-9][-a-z0-9]{2,62}$/.test(cloneName) || action.isPending}
                onClick={() => {
                  action.mutate({ path: `/vms/${vm.id}/clone`, body: { newName: cloneName } });
                  setShowClone(false);
                }}
              >
                Klonen starten
              </button>
              <button className="btn-secondary" onClick={() => setShowClone(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
      {showMigrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl p-6 shadow-xl" style={{ background: 'var(--surface)' }}>
            <h3 className="mb-4 text-lg font-semibold">VM migrieren</h3>
            <p className="mb-3 text-sm" style={{ color: 'var(--tx-2)' }}>Ziel-Node wählen (VM muss gestoppt sein)</p>
            <select
              className="input mb-4"
              value={migrateNodeId}
              onChange={(e) => setMigrateNodeId(e.target.value)}
            >
              <option value="">Node auswählen…</option>
              {nodes?.filter((n) => n.state === 'online' && n.id !== vm.node.id).map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={!migrateNodeId || action.isPending}
                onClick={() => {
                  action.mutate({ path: `/vms/${vm.id}/migrate`, body: { targetNodeId: migrateNodeId } });
                  setShowMigrate(false);
                }}
              >
                Migration starten
              </button>
              <button className="btn-secondary" onClick={() => setShowMigrate(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
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
          {can('vm.create') && vm.state === 'stopped' && (
            <button className="btn-secondary" onClick={() => {
              setCloneName(`${vm.name}-clone`);
              setShowClone(true);
            }}>
              Klonen
            </button>
          )}
          {can('vm.manage') && vm.state === 'stopped' && (
            <button className="btn-secondary" onClick={() => {
              setMigrateNodeId('');
              setShowMigrate(true);
            }}>
              Migrieren
            </button>
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
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>vCPUs</dt><dd>{vm.vcpus}</dd></div>
            {(vm.cpuSockets > 1 || vm.cpuCores > 1 || vm.cpuThreads > 1) && (
              <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>CPU-Topologie</dt>
                <dd>{vm.cpuSockets}S × {vm.cpuCores}C × {vm.cpuThreads}T</dd></div>
            )}
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>RAM</dt><dd>{(vm.memoryMb / 1024).toFixed(1)} GiB</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>BIOS</dt>
              <dd className="uppercase text-xs font-mono">{vm.bios ?? 'seabios'}</dd></div>
            {vm.bootOrder?.length > 0 && (
              <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Boot-Reihenfolge</dt>
                <dd className="text-xs font-mono">{vm.bootOrder.join(' → ')}</dd></div>
            )}
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Node</dt><dd>{vm.node.name}</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Besitzer</dt><dd>{vm.owner.name} ({vm.owner.email})</dd></div>
            <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Erstellt</dt><dd>{new Date(vm.createdAt).toLocaleString()}</dd></div>
          </dl>
          {showResize && (
            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
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

          {/* Tags & Description */}
          {(vm.description || (vm.tags && vm.tags.length > 0) || showMeta) && !showMeta && (
            <div className="mt-4 border-t pt-4 text-sm space-y-2" style={{ borderColor: 'var(--border)' }}>
              {vm.description && <p className="italic" style={{ color: 'var(--tx-2)' }}>{vm.description}</p>}
              {vm.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {vm.tags.map((t) => (
                    <span key={t} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--brand-sub)', color: 'var(--brand)' }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {can('vm.manage') && !showMeta && (
            <button className="mt-3 text-xs" style={{ color: 'var(--tx-3)' }}
              onClick={() => { setMetaForm({ description: vm.description ?? '', tags: vm.tags.join(', ') }); setShowMeta(true); }}>
              Beschreibung & Tags bearbeiten
            </button>
          )}
          {showMeta && (
            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <label className="label">Beschreibung</label>
                <input className="input" value={metaForm.description}
                  onChange={(e) => setMetaForm({ ...metaForm, description: e.target.value })} />
              </div>
              <div>
                <label className="label">Tags (kommagetrennt)</label>
                <input className="input" placeholder="web, prod, nginx" value={metaForm.tags}
                  onChange={(e) => setMetaForm({ ...metaForm, tags: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={() => {
                  const tags = metaForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
                  action.mutate({ path: `/vms/${vm.id}/meta`, method: 'PATCH', body: { description: metaForm.description || null, tags } });
                  setShowMeta(false);
                }}>
                  Speichern
                </button>
                <button className="btn-secondary" onClick={() => setShowMeta(false)}>Abbrechen</button>
              </div>
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <div>
            <h2 className="mb-3 font-semibold">Disks</h2>
            <ul className="space-y-2 text-sm">
              {vm.disks.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span style={{ color: 'var(--tx-2)' }}>{d.name}</span>
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
            </ul>
          </div>

          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Netzwerk-Interfaces</h2>
              {can('vm.manage') && (
                <button className="btn-secondary text-xs" onClick={() => { setAddNicNetworkId(''); setAddNicPoolId(''); setShowAddNic(!showAddNic); }}>
                  {showAddNic ? 'Abbrechen' : '+ NIC'}
                </button>
              )}
            </div>

            {showAddNic && (
              <div className="mb-3 flex flex-wrap gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <select className="input flex-1 min-w-[160px]" value={addNicNetworkId}
                  onChange={(e) => { setAddNicNetworkId(e.target.value); setAddNicPoolId(''); }}>
                  <option value="">Netzwerk wählen…</option>
                  {networks?.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.mode})</option>)}
                </select>
                {addNicNetworkId && (() => {
                  const net = networks?.find((n) => n.id === addNicNetworkId);
                  return net && net.ipPools.length > 0 ? (
                    <select className="input flex-1 min-w-[160px]" value={addNicPoolId}
                      onChange={(e) => setAddNicPoolId(e.target.value)}>
                      <option value="">Kein IP-Pool (manuell)</option>
                      {net.ipPools.map((p) => <option key={p.id} value={p.id}>{p.cidr}</option>)}
                    </select>
                  ) : null;
                })()}
                <button className="btn-primary text-xs" disabled={!addNicNetworkId || action.isPending}
                  onClick={() => {
                    action.mutate({
                      path: `/vms/${vm.id}/nics`,
                      body: { networkId: addNicNetworkId, ...(addNicPoolId ? { ipPoolId: addNicPoolId } : {}) },
                    });
                    setShowAddNic(false);
                  }}>
                  NIC hinzufügen
                </button>
              </div>
            )}

            <ul className="space-y-2 text-sm">
              {vm.nics.map((nic) => (
                <li key={nic.id} className="flex items-center justify-between gap-2">
                  <span className="shrink-0" style={{ color: 'var(--tx-2)' }}>{nic.network.name}</span>
                  <span className="font-mono text-xs flex-1 truncate">{nic.mac}{nic.ips[0] ? ` · ${nic.ips[0].address}` : ''}</span>
                  {can('vm.manage') && vm.nics.length > 1 && (
                    <button className="btn-danger text-xs shrink-0"
                      disabled={action.isPending}
                      onClick={() => {
                        if (confirm(`NIC ${nic.mac} entfernen?`)) {
                          action.mutate({ path: `/vms/${vm.id}/nics/${nic.id}`, method: 'DELETE' });
                        }
                      }}>
                      Entfernen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {can('vm.manage') && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">PCI-Passthrough</h2>
            {vm.state === 'stopped' && (
              <button className="btn-secondary text-xs" onClick={() => setShowAddPci(!showAddPci)}>
                {showAddPci ? 'Abbrechen' : '+ PCI-Gerät'}
              </button>
            )}
          </div>

          {showAddPci && (
            <div className="mb-4 rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--tx-2)' }}>Verfügbare PCI-Geräte auf Node {vm.node.name}:</p>
              {nodePciDevices ? (
                <select className="input" value={selectedPciAddr}
                  onChange={(e) => setSelectedPciAddr(e.target.value)}>
                  <option value="">Gerät wählen…</option>
                  {nodePciDevices.devices?.filter((d) => !['bridge', 'usb'].some((s) => d.class.includes(s))).map((d) => (
                    <option key={d.address} value={d.address}>
                      {d.address} — {d.vendor} {d.device}
                      {d.driver ? ` [${d.driver}]` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs" style={{ color: 'var(--tx-3)' }}>Lade PCI-Geräte…</p>
              )}
              <button className="btn-primary text-xs"
                disabled={!selectedPciAddr || action.isPending}
                onClick={() => {
                  const parts = selectedPciAddr.split(':');
                  const slotFn = parts[2]?.split('.') ?? ['0', '0'];
                  action.mutate({
                    path: `/vms/${vm.id}/pci`,
                    body: {
                      domain: `0x${parts[0]}`,
                      bus: `0x${parts[1]}`,
                      slot: `0x${slotFn[0]}`,
                      function: `0x${slotFn[1] ?? '0'}`,
                      label: nodePciDevices?.devices?.find((d) => d.address === selectedPciAddr)
                        ?.device ?? undefined,
                    },
                  });
                  setShowAddPci(false);
                  setSelectedPciAddr('');
                }}>
                Hinzufügen
              </button>
            </div>
          )}

          {pciDevices && pciDevices.length > 0 ? (
            <table className="table-base text-sm">
              <thead><tr><th>Adresse</th><th>Label</th><th></th></tr></thead>
              <tbody>
                {pciDevices.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs">{p.domain}:{p.bus}:{p.slot}.{p.function}</td>
                    <td style={{ color: 'var(--tx-2)' }}>{p.label ?? '—'}</td>
                    <td className="text-right">
                      {vm.state === 'stopped' && (
                        <button className="btn-danger text-xs"
                          onClick={() => action.mutate({ path: `/vms/${vm.id}/pci/${p.id}`, method: 'DELETE' })}>
                          Entfernen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm" style={{ color: 'var(--tx-3)' }}>Kein PCI-Passthrough konfiguriert</p>
          )}
        </div>
      )}

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
                      b.state === 'completed' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : b.state === 'running' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                      : 'bg-red-500/15 text-red-600 dark:text-red-400'
                    }`}>{b.state}</span>
                  </td>
                  <td className="text-right space-x-1">
                    {can('backup.manage') && b.state === 'completed' && (
                      <button className="btn-secondary text-xs"
                        disabled={action.isPending}
                        onClick={() => {
                          if (confirm('VM aus diesem Backup wiederherstellen? Die VM wird dabei gestoppt.')) {
                            action.mutate({ path: `/vms/${vm.id}/backups/${b.id}/restore` });
                          }
                        }}>
                        Wiederherstellen
                      </button>
                    )}
                    {can('backup.manage') && (
                      <button className="btn-danger text-xs"
                        onClick={() => action.mutate({ path: `/vms/${vm.id}/backups/${b.id}`, method: 'DELETE' })}>
                        Löschen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!backups?.length && <tr><td colSpan={5} className="text-center" style={{ color: 'var(--tx-3)' }}>Keine Backups</td></tr>}
            </tbody>
          </table>

          {/* Backup Schedules */}
          <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
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
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : ''}`} style={s.enabled ? {} : { background: 'var(--surface-2)', color: 'var(--tx-2)' }}>
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
              <p className="text-sm" style={{ color: 'var(--tx-3)' }}>Keine Zeitpläne konfiguriert</p>
            )}
          </div>
        </div>
      )}

      {can('vm.manage') && (
        <div className="card">
          <h2 className="mb-3 font-semibold">ISO-Laufwerk</h2>
          {vm.mountedIso ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">Eingehängt</span>
                <span className="font-mono text-sm">{vm.mountedIso.name}</span>
              </div>
              <button
                className="btn-secondary text-xs"
                disabled={action.isPending}
                onClick={() => action.mutate({ path: `/vms/${vm.id}/iso`, method: 'DELETE' })}
              >
                Aushängen
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <select
                className="input flex-1"
                defaultValue=""
                id={`iso-select-${vm.id}`}
              >
                <option value="">ISO auswählen…</option>
                {isos?.map((iso) => (
                  <option key={iso.id} value={iso.id}>{iso.name}</option>
                ))}
              </select>
              <button
                className="btn-secondary text-sm"
                disabled={action.isPending}
                onClick={() => {
                  const sel = document.getElementById(`iso-select-${vm.id}`) as HTMLSelectElement;
                  if (!sel.value) return;
                  action.mutate({ path: `/vms/${vm.id}/iso`, method: 'POST', body: { isoId: sel.value } });
                }}
              >
                Einhängen
              </button>
            </div>
          )}
        </div>
      )}

      <AiDiagnoseCard resourceType="vm" resourceId={vm.id} />

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
              {!snapshots?.length && <tr><td colSpan={3} className="text-center" style={{ color: 'var(--tx-3)' }}>Keine Snapshots</td></tr>}
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
