import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Container, Node } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

const OS_TEMPLATES = [
  'debian-12',
  'ubuntu-22.04',
  'ubuntu-24.04',
  'alpine-3.19',
  'rockylinux-9',
  'fedora-39',
];

const defaultForm = {
  name: '',
  vcpus: 1,
  memoryMb: 512,
  diskGb: 10,
  osTemplate: 'debian-12',
  ipAddress: '',
  description: '',
  nodeId: '',
};

export default function ContainersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [formErr, setFormErr] = useState('');

  const { data: containers, isLoading } = useQuery({
    queryKey: ['containers'],
    queryFn: () => api<Container[]>('/containers'),
    refetchInterval: 10_000,
  });

  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
    enabled: can('node.read'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['containers'] });

  const create = useMutation({
    mutationFn: (body: typeof form & { nodeId?: string }) => api('/containers', { method: 'POST', body }),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setForm(defaultForm);
      setFormErr('');
    },
    onError: (e: any) => setFormErr(e?.message ?? 'Fehler beim Erstellen'),
  });

  const action = useMutation({
    mutationFn: ({ path, method }: { path: string; method?: string }) =>
      api(path, { method: method ?? 'POST', body: {} }),
    onSettled: invalidate,
  });

  function handleCreate() {
    if (!/^[a-z0-9][-a-z0-9]{2,62}$/.test(form.name)) {
      setFormErr('Name: 3–63 Zeichen, nur a-z, 0-9 und Bindestrich');
      return;
    }
    const body: any = { ...form };
    if (!body.nodeId) delete body.nodeId;
    if (!body.ipAddress) delete body.ipAddress;
    if (!body.description) delete body.description;
    create.mutate(body);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">LXC Container</h1>
        {can('vm.create') && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + Neuer Container
          </button>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="mb-4 text-lg font-semibold">Neuen Container erstellen</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value.replace(/[^a-z0-9-]/g, '') })}
                  placeholder="mein-container"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">vCPUs</label>
                  <input className="input" type="number" min="1" max="128" value={form.vcpus}
                    onChange={(e) => setForm({ ...form, vcpus: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <label className="label">RAM (MiB)</label>
                  <input className="input" type="number" min="128" step="128" value={form.memoryMb}
                    onChange={(e) => setForm({ ...form, memoryMb: parseInt(e.target.value) || 512 })} />
                </div>
                <div>
                  <label className="label">Disk (GB)</label>
                  <input className="input" type="number" min="5" max="4096" value={form.diskGb}
                    onChange={(e) => setForm({ ...form, diskGb: parseInt(e.target.value) || 10 })} />
                </div>
              </div>
              <div>
                <label className="label">OS-Template</label>
                <select className="input" value={form.osTemplate}
                  onChange={(e) => setForm({ ...form, osTemplate: e.target.value })}>
                  {OS_TEMPLATES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">IP-Adresse (optional)</label>
                  <input className="input" value={form.ipAddress} placeholder="192.168.1.100"
                    onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} />
                </div>
                <div>
                  <label className="label">Node (optional)</label>
                  <select className="input" value={form.nodeId}
                    onChange={(e) => setForm({ ...form, nodeId: e.target.value })}>
                    <option value="">Automatisch</option>
                    {nodes?.filter((n) => n.state === 'online').map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Beschreibung (optional)</label>
                <input className="input" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {formErr && <p className="text-sm text-red-500">{formErr}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={create.isPending}
                onClick={handleCreate}
              >
                Erstellen
              </button>
              <button className="btn-secondary" onClick={() => { setShowCreate(false); setFormErr(''); }}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Node</th>
              <th>OS</th>
              <th>IP</th>
              <th>Ressourcen</th>
              <th>Besitzer</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="text-center text-slate-400">Lade…</td></tr>
            )}
            {containers?.map((ct) => (
              <tr key={ct.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td><Link className="font-medium text-brand-500 hover:underline" to={`/containers/${ct.id}`}>{ct.name}</Link></td>
                <td><StatusBadge status={ct.state} /></td>
                <td>{ct.node.name}</td>
                <td className="text-xs">{ct.osTemplate}</td>
                <td className="font-mono text-xs">{ct.ipAddress ?? '—'}</td>
                <td className="text-xs">{ct.vcpus} vCPU · {ct.memoryMb >= 1024 ? `${(ct.memoryMb / 1024).toFixed(1)} GiB` : `${ct.memoryMb} MiB`} · {ct.diskGb} GB</td>
                <td>{ct.owner.name}</td>
                <td className="space-x-1 text-right">
                  {can('vm.manage') && ct.state === 'stopped' && (
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => action.mutate({ path: `/containers/${ct.id}/start` })}
                    >
                      Start
                    </button>
                  )}
                  {can('vm.manage') && ct.state === 'running' && (
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => action.mutate({ path: `/containers/${ct.id}/stop` })}
                    >
                      Stop
                    </button>
                  )}
                  {can('vm.delete') && (
                    <button
                      className="btn-danger text-xs"
                      onClick={() => {
                        if (confirm(`Container "${ct.name}" löschen?`)) {
                          action.mutate({ path: `/containers/${ct.id}`, method: 'DELETE' });
                        }
                      }}
                    >
                      Löschen
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && !containers?.length && (
              <tr><td colSpan={8} className="text-center text-slate-400">Keine Container vorhanden</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
