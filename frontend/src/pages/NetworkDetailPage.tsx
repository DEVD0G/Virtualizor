import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { IpPool, PortForwardRule } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface NetworkDetail {
  id: string;
  name: string;
  mode: 'bridged' | 'nat';
  bridge: string;
  vlanTag: number | null;
  cidr: string | null;
  ipPools: (IpPool & { _count?: { addresses: number } })[];
  _count?: { nics: number };
}

interface CreatePoolForm {
  cidr: string;
  gateway: string;
  dns: string;
}

type Tab = 'overview' | 'ip-pools' | 'port-forwarding';

export default function NetworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showPoolForm, setShowPoolForm] = useState(false);
  const [poolForm, setPoolForm] = useState<CreatePoolForm>({ cidr: '', gateway: '', dns: '' });
  const [showPfForm, setShowPfForm] = useState(false);
  const [pfForm, setPfForm] = useState({ protocol: 'tcp' as 'tcp' | 'udp', externalPort: '', internalIp: '', internalPort: '', description: '' });
  const [pfError, setPfError] = useState('');

  const { data: network, isLoading, error } = useQuery<NetworkDetail>({
    queryKey: ['network', id],
    queryFn: () => api<NetworkDetail>(`/networks/${id}`),
    enabled: !!id,
  });

  const { data: portForwards = [] } = useQuery<PortForwardRule[]>({
    queryKey: ['port-forwards', id],
    queryFn: () => api<PortForwardRule[]>(`/networks/${id}/port-forwards`),
    enabled: !!id && activeTab === 'port-forwarding',
  });

  const invalidateNetwork = () => qc.invalidateQueries({ queryKey: ['network', id] });

  const deleteNet = useMutation({
    mutationFn: () => api(`/networks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['networks'] });
      navigate('/networks');
    },
  });

  const createPool = useMutation({
    mutationFn: (form: CreatePoolForm) =>
      api(`/networks/${id}/ip-pools`, {
        method: 'POST',
        body: {
          cidr: form.cidr,
          gateway: form.gateway,
          dns: form.dns ? form.dns.split(',').map((s) => s.trim()) : ['1.1.1.1'],
        },
      }),
    onSuccess: () => {
      invalidateNetwork();
      setShowPoolForm(false);
      setPoolForm({ cidr: '', gateway: '', dns: '' });
    },
  });

  const deletePool = useMutation({
    mutationFn: (poolId: string) => api(`/networks/${id}/ip-pools/${poolId}`, { method: 'DELETE' }),
    onSuccess: invalidateNetwork,
  });

  const createPf = useMutation({
    mutationFn: (data: typeof pfForm) =>
      api(`/networks/${id}/port-forwards`, {
        method: 'POST',
        body: {
          protocol: data.protocol,
          externalPort: parseInt(data.externalPort),
          internalIp: data.internalIp,
          internalPort: parseInt(data.internalPort),
          ...(data.description ? { description: data.description } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['port-forwards', id] });
      setPfForm({ protocol: 'tcp', externalPort: '', internalIp: '', internalPort: '', description: '' });
      setPfError('');
      setShowPfForm(false);
    },
    onError: (e: any) => setPfError(e?.message ?? 'Fehler'),
  });

  const deletePf = useMutation({
    mutationFn: (pfId: string) => api(`/networks/${id}/port-forwards/${pfId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['port-forwards', id] }),
  });

  if (isLoading) return <div className="text-slate-400">Lade…</div>;
  if (error || !network) return <div className="text-red-500">Netzwerk nicht gefunden</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'ip-pools', label: 'IP-Pools' },
    { key: 'port-forwarding', label: 'Port Forwarding' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            className="mb-1 text-xs text-slate-500 hover:underline"
            onClick={() => navigate('/networks')}
          >
            ← Netzwerke
          </button>
          <h1 className="text-2xl font-semibold">{network.name}</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Übersicht */}
      {activeTab === 'overview' && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Netzwerkdetails</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Name</dt>
              <dd className="font-medium">{network.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Modus</dt>
              <dd className="font-medium capitalize">{network.mode}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Bridge-Interface</dt>
              <dd className="font-mono font-medium">{network.bridge}</dd>
            </div>
            {network.vlanTag != null && (
              <div>
                <dt className="text-xs text-slate-500">VLAN Tag</dt>
                <dd className="font-medium">{network.vlanTag}</dd>
              </div>
            )}
            {network.cidr && (
              <div>
                <dt className="text-xs text-slate-500">CIDR</dt>
                <dd className="font-mono font-medium">{network.cidr}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-500">Verbundene VMs/Container</dt>
              <dd className="font-medium">{network._count?.nics ?? 0}</dd>
            </div>
          </dl>
          {can('network.manage') && (
            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                className="btn-danger"
                onClick={() => {
                  if (confirm(`Netzwerk "${network.name}" wirklich löschen?`)) {
                    deleteNet.mutate();
                  }
                }}
                disabled={deleteNet.isPending}
              >
                {deleteNet.isPending ? 'Lösche…' : 'Netzwerk löschen'}
              </button>
              {deleteNet.isError && (
                <p className="mt-2 text-sm text-red-500">{(deleteNet.error as any)?.message}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: IP-Pools */}
      {activeTab === 'ip-pools' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">IP-Pools</h2>
            {can('network.manage') && (
              <button
                className="btn-secondary text-xs"
                onClick={() => setShowPoolForm(!showPoolForm)}
              >
                {showPoolForm ? 'Abbrechen' : '+ IP-Pool'}
              </button>
            )}
          </div>

          {showPoolForm && (
            <div className="card space-y-3">
              <h3 className="text-sm font-medium">Neuer IP-Pool</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label">CIDR</label>
                  <input
                    className="input"
                    placeholder="10.0.0.0/24"
                    value={poolForm.cidr}
                    onChange={(e) => setPoolForm({ ...poolForm, cidr: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Gateway</label>
                  <input
                    className="input"
                    placeholder="10.0.0.1"
                    value={poolForm.gateway}
                    onChange={(e) => setPoolForm({ ...poolForm, gateway: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">DNS (kommagetrennt)</label>
                  <input
                    className="input"
                    placeholder="1.1.1.1, 8.8.8.8"
                    value={poolForm.dns}
                    onChange={(e) => setPoolForm({ ...poolForm, dns: e.target.value })}
                  />
                </div>
              </div>
              {createPool.isError && (
                <p className="text-sm text-red-500">{(createPool.error as any)?.message}</p>
              )}
              <button
                className="btn-primary"
                disabled={createPool.isPending || !poolForm.cidr || !poolForm.gateway}
                onClick={() => createPool.mutate(poolForm)}
              >
                {createPool.isPending ? 'Erstelle…' : 'Pool hinzufügen'}
              </button>
            </div>
          )}

          {network.ipPools.length === 0 ? (
            <div className="card text-center text-slate-400">Keine IP-Pools konfiguriert.</div>
          ) : (
            <div className="card">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>CIDR</th>
                    <th>Gateway</th>
                    <th>DNS</th>
                    <th>Adressen</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {network.ipPools.map((pool) => (
                    <tr key={pool.id}>
                      <td className="font-mono text-xs">{pool.cidr}</td>
                      <td className="font-mono text-xs">{pool.gateway}</td>
                      <td className="font-mono text-xs">{pool.dns.join(', ')}</td>
                      <td>{pool._count?.addresses ?? '—'}</td>
                      <td className="text-right">
                        {can('network.manage') && (
                          <button
                            className="btn-danger text-xs"
                            onClick={() => {
                              if (confirm('IP-Pool löschen?')) deletePool.mutate(pool.id);
                            }}
                          >
                            Löschen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Port Forwarding */}
      {activeTab === 'port-forwarding' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Port Forwarding</h2>
            {can('network.manage') && (
              <button
                className="btn-secondary text-xs"
                onClick={() => { setShowPfForm(!showPfForm); setPfError(''); }}
              >
                {showPfForm ? 'Abbrechen' : '+ Regel'}
              </button>
            )}
          </div>

          {showPfForm && can('network.manage') && (
            <div className="card space-y-3">
              <h3 className="text-sm font-medium">Neue Weiterleitungsregel</h3>
              <div className="grid gap-2 sm:grid-cols-5">
                <select
                  className="input"
                  value={pfForm.protocol}
                  onChange={(e) => setPfForm({ ...pfForm, protocol: e.target.value as 'tcp' | 'udp' })}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="Ext. Port"
                  value={pfForm.externalPort}
                  onChange={(e) => setPfForm({ ...pfForm, externalPort: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Interne IP"
                  value={pfForm.internalIp}
                  onChange={(e) => setPfForm({ ...pfForm, internalIp: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="Int. Port"
                  value={pfForm.internalPort}
                  onChange={(e) => setPfForm({ ...pfForm, internalPort: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Beschreibung (opt.)"
                  value={pfForm.description}
                  onChange={(e) => setPfForm({ ...pfForm, description: e.target.value })}
                />
              </div>
              {pfError && <p className="text-sm text-red-500">{pfError}</p>}
              <button
                className="btn-primary"
                disabled={createPf.isPending || !pfForm.externalPort || !pfForm.internalIp || !pfForm.internalPort}
                onClick={() => createPf.mutate(pfForm)}
              >
                {createPf.isPending ? 'Erstelle…' : 'Regel hinzufügen'}
              </button>
            </div>
          )}

          {portForwards.length === 0 ? (
            <div className="card text-center text-slate-400">Keine Port-Forwarding-Regeln.</div>
          ) : (
            <div className="card">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Protokoll</th>
                    <th>Ext. Port</th>
                    <th>Interne IP</th>
                    <th>Int. Port</th>
                    <th>Beschreibung</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {portForwards.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono uppercase">{r.protocol}</td>
                      <td>{r.externalPort}</td>
                      <td className="font-mono">{r.internalIp}</td>
                      <td>{r.internalPort}</td>
                      <td>{r.description ?? '—'}</td>
                      <td className="text-right">
                        {can('network.manage') && (
                          <button
                            className="btn-danger text-xs"
                            onClick={() => deletePf.mutate(r.id)}
                          >
                            Löschen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
