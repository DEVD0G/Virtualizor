import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { api } from '../api/client';
import { PanelUser, Permission, ResourceQuota, Role } from '../api/types';
import StatusBadge from '../components/StatusBadge';

// ─── Quota Editor ─────────────────────────────────────────────────────────────

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
        <button onClick={() => {
          setOpen(true);
          if (quota) {
            setMaxVms(quota.maxVms?.toString() ?? '');
            setMaxVcpus(quota.maxVcpus?.toString() ?? '');
            setMaxMemGib(quota.maxMemoryMb ? String(quota.maxMemoryMb / 1024) : '');
            setMaxStorageGb(quota.maxStorageGb?.toString() ?? '');
          }
        }} className="text-xs text-brand-500 hover:underline">Bearbeiten</button>
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

// ─── Permission Checkboxes ────────────────────────────────────────────────────

function PermissionCheckboxes({
  allPermissions,
  selected,
  onChange,
}: {
  allPermissions: Permission[];
  selected: string[];
  onChange: (p: string[]) => void;
}) {
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const p of allPermissions) {
      const prefix = p.id.split('.')[0];
      if (!g[prefix]) g[prefix] = [];
      g[prefix].push(p.id);
    }
    return g;
  }, [allPermissions]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);
  }

  function toggleGroup(perms: string[]) {
    const allSelected = perms.every((p) => selected.includes(p));
    onChange(allSelected
      ? selected.filter((p) => !perms.includes(p))
      : [...new Set([...selected, ...perms])]);
  }

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      {Object.entries(groups).map(([group, perms]) => (
        <div key={group}>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</span>
            <button
              type="button"
              className="text-xs text-brand-500 hover:underline"
              onClick={() => toggleGroup(perms)}
            >
              {perms.every((p) => selected.includes(p)) ? 'Alle ab' : 'Alle an'}
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {perms.map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={selected.includes(p)}
                  onChange={() => toggle(p)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                />
                <span className="font-mono text-xs">{p.split('.')[1]}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const queryClient = useQueryClient();

  // Create user form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [createRoleId, setCreateRoleId] = useState('');
  const [createError, setCreateError] = useState('');

  // Edit user modal
  const [editUser, setEditUser] = useState<PanelUser | null>(null);
  const [editRoleId, setEditRoleId] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');

  // Create role modal
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] as string[] });
  const [roleFormError, setRoleFormError] = useState('');

  // Edit role modal
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [editRolePerms, setEditRolePerms] = useState<string[]>([]);

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api<PanelUser[]>('/users') });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles') });
  const { data: allPermissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api<Permission[]>('/permissions'),
    enabled: showCreateRole || !!editRole,
  });

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: ['roles'] });

  const createUser = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: { email, name, password, roleId: createRoleId } }),
    onSuccess: () => { invalidateUsers(); setEmail(''); setName(''); setPassword(''); setCreateError(''); },
    onError: (err: Error) => setCreateError(err.message),
  });

  const updateUser = useMutation({
    mutationFn: (data: { id: string; roleId?: string; isActive?: boolean; password?: string }) =>
      api(`/users/${data.id}`, {
        method: 'PATCH',
        body: {
          ...(data.roleId ? { roleId: data.roleId } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.password ? { password: data.password } : {}),
        },
      }),
    onSuccess: () => { invalidateUsers(); setEditUser(null); setEditPassword(''); },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateUsers,
  });

  const createRole = useMutation({
    mutationFn: () => api('/roles', { method: 'POST', body: { name: roleForm.name, description: roleForm.description || undefined, permissions: roleForm.permissions } }),
    onSuccess: () => { invalidateRoles(); setShowCreateRole(false); setRoleForm({ name: '', description: '', permissions: [] }); setRoleFormError(''); },
    onError: (err: Error) => setRoleFormError(err.message),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      api(`/roles/${id}`, { method: 'PATCH', body: { permissions } }),
    onSuccess: () => { invalidateRoles(); setEditRole(null); },
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateRoles,
  });

  const submitCreate = (e: FormEvent) => { e.preventDefault(); createUser.mutate(); };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Benutzer & Rollen</h1>

      {/* Create user form */}
      <form onSubmit={submitCreate} className="card grid gap-3 sm:grid-cols-5">
        <input className="input" placeholder="E-Mail" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" placeholder="Name" value={name}
          onChange={(e) => setName(e.target.value)} required />
        <input className="input" placeholder="Passwort (min. 10)" type="password" minLength={10}
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <select className="input" value={createRoleId} onChange={(e) => setCreateRoleId(e.target.value)} required>
          <option value="">Rolle…</option>
          {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button className="btn-primary justify-center" disabled={createUser.isPending}>Anlegen</button>
        {createError && <p className="col-span-full text-sm text-red-500">{createError}</p>}
      </form>

      {/* Users table */}
      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr><th>E-Mail</th><th>Name</th><th>Rolle</th><th>Status</th><th>Erstellt</th><th></th></tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td>{u.email}</td>
                <td>{u.name}</td>
                <td>{u.role.name}</td>
                <td><StatusBadge status={u.isActive ? 'running' : 'stopped'} /></td>
                <td className="text-xs text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="space-x-1 text-right">
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => {
                      setEditUser(u);
                      setEditRoleId(u.role.id);
                      setEditActive(u.isActive);
                      setEditPassword('');
                    }}
                  >
                    Bearbeiten
                  </button>
                  <button
                    className={u.isActive ? 'btn-secondary text-xs' : 'btn-primary text-xs'}
                    onClick={() => updateUser.mutate({ id: u.id, isActive: !u.isActive })}
                    disabled={updateUser.isPending}
                  >
                    {u.isActive ? 'Sperren' : 'Aktivieren'}
                  </button>
                  <button
                    className="btn-danger text-xs"
                    onClick={() => {
                      if (confirm(`Benutzer "${u.email}" löschen?`)) deleteUser.mutate(u.id);
                    }}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit user modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900 space-y-4">
            <h3 className="font-semibold">Benutzer bearbeiten: {editUser.email}</h3>
            <div>
              <label className="label">Rolle</label>
              <select className="input" value={editRoleId} onChange={(e) => setEditRoleId(e.target.value)}>
                {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Neues Passwort (leer lassen = unverändert)</label>
              <input className="input" type="password" minLength={10} value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)} placeholder="min. 10 Zeichen" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)}
                className="rounded border-slate-300 text-brand-500 focus:ring-brand-500" />
              <span className="text-sm">Konto aktiv</span>
            </label>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={updateUser.isPending}
                onClick={() => updateUser.mutate({
                  id: editUser.id,
                  roleId: editRoleId !== editUser.role.id ? editRoleId : undefined,
                  isActive: editActive !== editUser.isActive ? editActive : undefined,
                  password: editPassword || undefined,
                })}
              >
                Speichern
              </button>
              <button className="btn-secondary" onClick={() => setEditUser(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Roles section */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Rollen</h2>
          <button className="btn-primary text-sm" onClick={() => {
            setShowCreateRole(true);
            setRoleForm({ name: '', description: '', permissions: [] });
            setRoleFormError('');
          }}>
            + Neue Rolle
          </button>
        </div>
        <table className="table-base">
          <thead>
            <tr><th>Rolle</th><th>Benutzer</th><th>Ressourcen-Limits</th><th>Permissions</th><th></th></tr>
          </thead>
          <tbody>
            {roles?.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">
                  {r.name}
                  {r.isSystem && <span className="ml-2 text-xs text-slate-400">(System)</span>}
                </td>
                <td>{r._count.users}</td>
                <td><QuotaEditor role={r} /></td>
                <td className="max-w-xs text-xs text-slate-500">
                  {r.permissions.map((p) => p.permissionId).join(', ') || '—'}
                </td>
                <td className="space-x-1 text-right">
                  {!r.isSystem && (
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => {
                        setEditRole(r);
                        setEditRolePerms(r.permissions.map((p) => p.permissionId));
                      }}
                    >
                      Permissions
                    </button>
                  )}
                  {!r.isSystem && r._count.users === 0 && (
                    <button
                      className="btn-danger text-xs"
                      disabled={deleteRole.isPending}
                      onClick={() => {
                        if (confirm(`Rolle "${r.name}" löschen?`)) deleteRole.mutate(r.id);
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

      {/* Create role modal */}
      {showCreateRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900 space-y-4">
            <h3 className="font-semibold">Neue Rolle erstellen</h3>
            <div>
              <label className="label">Name</label>
              <input className="input" value={roleForm.name}
                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="editor" />
            </div>
            <div>
              <label className="label">Beschreibung (optional)</label>
              <input className="input" value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
            </div>
            <div>
              <label className="label mb-2">Berechtigungen</label>
              {allPermissions ? (
                <PermissionCheckboxes
                  allPermissions={allPermissions}
                  selected={roleForm.permissions}
                  onChange={(p) => setRoleForm({ ...roleForm, permissions: p })}
                />
              ) : (
                <p className="text-sm text-slate-400">Lade…</p>
              )}
            </div>
            {roleFormError && <p className="text-sm text-red-500">{roleFormError}</p>}
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={createRole.isPending || !roleForm.name || roleForm.permissions.length === 0}
                onClick={() => createRole.mutate()}
              >
                Erstellen
              </button>
              <button className="btn-secondary" onClick={() => setShowCreateRole(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit role permissions modal */}
      {editRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900 space-y-4">
            <h3 className="font-semibold">Berechtigungen: {editRole.name}</h3>
            {allPermissions ? (
              <PermissionCheckboxes
                allPermissions={allPermissions}
                selected={editRolePerms}
                onChange={setEditRolePerms}
              />
            ) : (
              <p className="text-sm text-slate-400">Lade…</p>
            )}
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={updateRole.isPending}
                onClick={() => updateRole.mutate({ id: editRole.id, permissions: editRolePerms })}
              >
                Speichern
              </button>
              <button className="btn-secondary" onClick={() => setEditRole(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
