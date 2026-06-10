import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { Network } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface CreateNetworkForm {
  name: string;
  mode: 'bridged' | 'nat';
  bridge: string;
  vlanTag: string;
}

interface CreatePoolForm {
  cidr: string;
  gateway: string;
  dns: string;
}

export default function NetworksPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [showNetForm, setShowNetForm] = useState(false);
  const [netForm, setNetForm] = useState<CreateNetworkForm>({ name: '', mode: 'bridged', bridge: 'vmbr0', vlanTag: '' });
  const [poolForms, setPoolForms] = useState<Record<string, CreatePoolForm>>({});
  const [showPoolFor, setShowPoolFor] = useState<string | null>(null);

  const { data: networks = [], isLoading } = useQuery({
    queryKey: ['networks'],
    queryFn: () => api<Network[]>('/networks'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['networks'] });

  const createNet = useMutation({
    mutationFn: (data: typeof netForm) =>
      api('/networks', {
        method: 'POST',
        body: {
          name: data.name,
          mode: data.mode,
          bridge: data.bridge,
          ...(data.vlanTag ? { vlanTag: parseInt(data.vlanTag) } : {}),
        },
      }),
    onSuccess: () => { invalidate(); setShowNetForm(false); setNetForm({ name: '', mode: 'bridged', bridge: 'vmbr0', vlanTag: '' }); },
  });

  const deleteNet = useMutation({
    mutationFn: (id: string) => api(`/networks/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const createPool = useMutation({
    mutationFn: ({ networkId, form }: { networkId: string; form: CreatePoolForm }) =>
      api(`/networks/${networkId}/ip-pools`, {
        method: 'POST',
        body: {
          cidr: form.cidr,
          gateway: form.gateway,
          dns: form.dns ? form.dns.split(',').map((s) => s.trim()) : ['1.1.1.1'],
        },
      }),
    onSuccess: (_, { networkId }) => { invalidate(); setShowPoolFor(null); setPoolForms((f) => { const c = { ...f }; delete c[networkId]; return c; }); },
  });

  const deletePool = useMutation({
    mutationFn: ({ networkId, poolId }: { networkId: string; poolId: string }) =>
      api(`/networks/${networkId}/ip-pools/${poolId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  if (isLoading) return <div className="text-slate-400">Lade…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Netzwerke</h1>
        {can('network.manage') && (
          <button className="btn-primary" onClick={() => setShowNetForm(!showNetForm)}>
            {showNetForm ? 'Abbrechen' : '+ Netzwerk'}
          </button>
        )}
      </div>

      {showNetForm && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Netzwerk erstellen</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Name</label>
              <input className="input" placeholder="mein-netz" value={netForm.name}
                onChange={(e) => setNetForm({ ...netForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
              <p className="mt-1 text-xs text-slate-500">3–63 Zeichen: a-z, 0-9, Bindestrich</p>
            </div>
            <div>
              <label className="label">Modus</label>
              <select className="input" value={netForm.mode}
                onChange={(e) => setNetForm({ ...netForm, mode: e.target.value as 'bridged' | 'nat' })}>
                <option value="bridged">Bridged</option>
                <option value="nat">NAT</option>
              </select>
            </div>
            <div>
              <label className="label">Bridge</label>
              <input className="input" placeholder="vmbr0" value={netForm.bridge}
                onChange={(e) => setNetForm({ ...netForm, bridge: e.target.value })} />
            </div>
            <div>
              <label className="label">VLAN Tag (optional)</label>
              <input className="input" type="number" placeholder="100" value={netForm.vlanTag}
                onChange={(e) => setNetForm({ ...netForm, vlanTag: e.target.value })} />
            </div>
          </div>
          {createNet.isError && (
            <p className="text-sm text-red-500">{(createNet.error as any)?.message}</p>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => createNet.mutate(netForm)}
              disabled={createNet.isPending || netForm.name.length < 3 || !netForm.bridge}>
              {createNet.isPending ? 'Erstelle…' : 'Erstellen'}
            </button>
          </div>
        </div>
      )}

      {networks.length === 0 && (
        <div className="card text-center text-slate-400">Keine Netzwerke konfiguriert.</div>
      )}

      {networks.map((net) => (
        <div key={net.id} className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold">{net.name}</span>
              <span className="ml-2 text-xs text-slate-500">
                {net.mode} · {net.bridge}{net.vlanTag ? ` · VLAN ${net.vlanTag}` : ''}
              </span>
            </div>
            {can('network.manage') && (
              <button className="btn-danger text-xs"
                onClick={() => { if (confirm(`Netzwerk "${net.name}" löschen?`)) deleteNet.mutate(net.id); }}>
                Löschen
              </button>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">IP-Pools</span>
              {can('network.manage') && (
                <button className="btn-secondary text-xs"
                  onClick={() => setShowPoolFor(showPoolFor === net.id ? null : net.id)}>
                  {showPoolFor === net.id ? 'Abbrechen' : '+ IP-Pool'}
                </button>
              )}
            </div>

            {showPoolFor === net.id && (
              <div className="mb-3 grid gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-3">
                <div>
                  <label className="label">CIDR</label>
                  <input className="input" placeholder="10.0.0.0/24"
                    value={poolForms[net.id]?.cidr ?? ''}
                    onChange={(e) => setPoolForms({ ...poolForms, [net.id]: { ...(poolForms[net.id] ?? { cidr: '', gateway: '', dns: '' }), cidr: e.target.value } })} />
                </div>
                <div>
                  <label className="label">Gateway</label>
                  <input className="input" placeholder="10.0.0.1"
                    value={poolForms[net.id]?.gateway ?? ''}
                    onChange={(e) => setPoolForms({ ...poolForms, [net.id]: { ...(poolForms[net.id] ?? { cidr: '', gateway: '', dns: '' }), gateway: e.target.value } })} />
                </div>
                <div>
                  <label className="label">DNS (kommagetrennt)</label>
                  <input className="input" placeholder="1.1.1.1, 8.8.8.8"
                    value={poolForms[net.id]?.dns ?? ''}
                    onChange={(e) => setPoolForms({ ...poolForms, [net.id]: { ...(poolForms[net.id] ?? { cidr: '', gateway: '', dns: '' }), dns: e.target.value } })} />
                </div>
                <div className="flex items-end sm:col-span-3">
                  <button className="btn-primary"
                    disabled={createPool.isPending || !poolForms[net.id]?.cidr || !poolForms[net.id]?.gateway}
                    onClick={() => createPool.mutate({ networkId: net.id, form: poolForms[net.id] })}>
                    Pool hinzufügen
                  </button>
                </div>
              </div>
            )}

            {net.ipPools.length === 0 ? (
              <p className="text-sm text-slate-400">Keine IP-Pools</p>
            ) : (
              <table className="table-base">
                <thead>
                  <tr><th>CIDR</th><th>Gateway</th><th>DNS</th><th>Adressen</th><th></th></tr>
                </thead>
                <tbody>
                  {net.ipPools.map((pool) => (
                    <tr key={pool.id}>
                      <td className="font-mono text-xs">{pool.cidr}</td>
                      <td className="font-mono text-xs">{pool.gateway}</td>
                      <td className="font-mono text-xs">{pool.dns.join(', ')}</td>
                      <td>{pool._count?.addresses ?? '—'}</td>
                      <td className="text-right">
                        {can('network.manage') && (
                          <button className="btn-danger text-xs"
                            onClick={() => { if (confirm('IP-Pool löschen?')) deletePool.mutate({ networkId: net.id, poolId: pool.id }); }}>
                            Löschen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
