import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api } from '../api/client';
import { PanelUser, Role } from '../api/types';
import StatusBadge from '../components/StatusBadge';

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
          <thead><tr><th>Rolle</th><th>Benutzer</th><th>Permissions</th></tr></thead>
          <tbody>
            {roles?.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}{r.isSystem && <span className="ml-2 text-xs text-slate-400">(System)</span>}</td>
                <td>{r._count.users}</td>
                <td className="max-w-md text-xs text-slate-500">{r.permissions.map((p) => p.permissionId).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
