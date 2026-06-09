import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Node } from '../api/types';

interface Network { id: string; name: string; ipPools: { id: string; cidr: string }[] }

export default function CreateVmPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [vcpus, setVcpus] = useState(2);
  const [memoryGb, setMemoryGb] = useState(4);
  const [diskGb, setDiskGb] = useState(40);
  const [nodeId, setNodeId] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [ipPoolId, setIpPoolId] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [error, setError] = useState('');

  const { data: nodes } = useQuery({ queryKey: ['nodes'], queryFn: () => api<Node[]>('/nodes') });
  const { data: networks } = useQuery({ queryKey: ['networks'], queryFn: () => api<Network[]>('/networks') });

  const create = useMutation({
    mutationFn: () =>
      api<{ vm: { id: string } }>('/vms', {
        method: 'POST',
        body: {
          name,
          vcpus,
          memoryMb: memoryGb * 1024,
          disks: [{ sizeGb: diskGb }],
          nics: [{ networkId, ...(ipPoolId ? { ipPoolId } : {}) }],
          templateId: 'ubuntu-24.04',
          ...(nodeId ? { nodeId } : {}),
          cloudInit: sshKey ? { sshKeys: [sshKey.trim()] } : undefined,
        },
      }),
    onSuccess: (data) => navigate(`/vms/${data.vm.id}`),
    onError: (err: Error) => setError(err.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    create.mutate();
  };

  const selectedNetwork = networks?.find((n) => n.id === networkId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Neue VM erstellen</h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            pattern="[a-z0-9][a-z0-9-]{2,62}" placeholder="web-01" required />
          <p className="mt-1 text-xs text-slate-500">3–63 Zeichen: a-z, 0-9, Bindestrich</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">vCPUs</label>
            <input className="input" type="number" min={1} max={128} value={vcpus}
              onChange={(e) => setVcpus(+e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">RAM (GiB)</label>
            <input className="input" type="number" min={1} max={1024} value={memoryGb}
              onChange={(e) => setMemoryGb(+e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Disk (GB)</label>
            <input className="input" type="number" min={10} max={16384} value={diskGb}
              onChange={(e) => setDiskGb(+e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Node</label>
            <select className="input" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
              <option value="">Automatisch (Scheduler)</option>
              {nodes?.filter((n) => n.state === 'online').map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Netzwerk</label>
            <select className="input" value={networkId} onChange={(e) => { setNetworkId(e.target.value); setIpPoolId(''); }} required>
              <option value="">— wählen —</option>
              {networks?.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>
        </div>

        {selectedNetwork && selectedNetwork.ipPools.length > 0 && (
          <div>
            <label className="mb-1 block text-sm font-medium">IP-Pool</label>
            <select className="input" value={ipPoolId} onChange={(e) => setIpPoolId(e.target.value)}>
              <option value="">Keine IP zuweisen</option>
              {selectedNetwork.ipPools.map((p) => <option key={p.id} value={p.id}>{p.cidr}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">SSH Public Key (cloud-init)</label>
          <textarea className="input font-mono text-xs" rows={3} value={sshKey}
            onChange={(e) => setSshKey(e.target.value)} placeholder="ssh-ed25519 AAAA…" />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate('/vms')}>Abbrechen</button>
          <button className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Erstelle…' : 'VM erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}
