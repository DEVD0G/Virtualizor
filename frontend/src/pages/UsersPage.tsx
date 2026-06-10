import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { PanelUser, ResourceQuota, Role } from '../api/types';
import StatusBadge from '../components/StatusBadge';

function QuotaEditor({ role }: { role: Role }) {
  const qc = useQueryClient();
  const { data: quota } = useQuery({
    queryKey: ['quota', role.id],
    queryFn: () => api<ResourceQuota | null>(`/roles/${role.id}/quota`).catch(() => null),
  });
  const [maxVms, setMaxVms] = useState('');
  const [maxVcpus, setMaxVcpus] = useState('');
  const [maxMemGib, setMaxMemGib] = useState('');
  const [maxStorageGb, setMaxStorageGb] = useState('');
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: () => api(`/roles/${role.id}/quota`, {
      method: 'PUT',
      body: {
        maxVms: maxVms ? Number(maxVms) : undefined,
        maxVcpus: maxVcpus ? Number(maxVcpus) : undefined,
        maxMemoryMb: maxMemGib ? Math.round(Number(maxMemGib) * 1024) : undefined,
        maxStorageGb: maxStorageGb ? Number(maxStorageGb) : undefined,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quota', role.id] }); setOpen(false); },
  });

  const clear = useMutation({
    mutationFn: () => api(`/roles/${role.id}/quota`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quota', role.id] }),
  });

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        {quota ? (
          <span className="text-xs text-slate-500">
            {[
              quota.maxVms != null && `${quota.maxVms} VMs`,
              quota.maxVcpus != null && `${quota.maxVcpus} vCPUs`,
              quota.maxMemoryMb != null && `${(quota.maxMemoryMb / 1024).toFixed(0)} GiB RAM`,
              quota.maxStorageGb != null && `${quota.maxStorageGb} GiB Disk`,
            ].filter(Boolean).join(' · ')}
          </span>
        ) : <span className="text-xs text-slate-400">Keine Limits</span>}
        <button onClick={() => { setOpen(true); if (quota) { setMaxVms(quota.maxVms?.toString() ?? ''); setMaxVcpus(quota.maxVcpus?.toString() ?? ''); setMaxMemGib(quota.maxMemoryMb ? String(quota.maxMemoryMb / 1024) : ''); setMaxStorageGb(quota.maxStorageGb?.toString() ?? ''); } }} className="text-xs text-brand-500 hover:underline">Bearbeiten</button>
        {quota && <button onClick={() => clear.mutate()} className="text-xs text-red-500 hover:underline">Entfernen</button>}
      </div>
    );
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <input className="input w-20" placeholder="Max VMs" type="number" min="0" value={maxVms} onChange={(e) => setMaxVms(e.target.value)} />
      <input className="input w-24" placeholder="Max vCPUs" type="number" min="0" value={maxVcpus} onChange={(e) => setMaxVcpus(e.target.value)} />
      <input className="input w-28" placeholder="Max RAM (GiB)" type="number" min="0" step="0.5" value={maxMemGib} onChange={(e) => setMaxMemGib(e.target.value)} />
      <input className="input w-28" placeholder="Max Disk (GB)" type="number" min="0" value={maxStorageGb} onChange={(e) => setMaxStorageGb(e.target.value)} />
      <button className="btn-primary" disabled={save.isPending}>Speichern</button>
      <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Abbrechen</button>
    </form>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState('');

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api<PanelUser[]>('/users') });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });

  const create = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: { email, name, password, roleId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEmail(''); setName(''); setPassword(''); setError('');
    },
    onError: (err: Error) => setError(err.message),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Benutzer & Rollen</h1>

      <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-5">
        <input className="input" placeholder="E-Mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="input" placeholder="Passwort (min. 10)" type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
          <option value="">Rolle…</option>
          {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button className="btn-primary justify-center" disabled={create.isPending}>Anlegen</button>
        {error && <p className="col-span-full text-sm text-red-500">{error}</p>}
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead><tr><th>E-Mail</th><th>Name</th><th>Rolle</th><th>Status</th><th>Erstellt</th></tr></thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>{u.role.name}</td>
                <td><StatusBadge status={u.isActive ? 'active' : 'stopped'} /></td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Rollen</h2>
        <table className="table-base">
          <thead><tr><th>Rolle</th><th>Benutzer</th><th>Ressourcen-Limits</th><th>Permissions</th></tr></thead>
          <tbody>
            {roles?.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}{r.isSystem && <span className="ml-2 text-xs text-slate-400">(System)</span>}</td>
                <td>{r._count.users}</td>
                <td><QuotaEditor role={r} /></td>
                <td className="max-w-xs text-xs text-slate-500">{r.permissions.map((p) => p.permissionId).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
