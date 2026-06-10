import { useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { LicenseState } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLiveEvents } from '../hooks/useSocket';

const nav = [
  { to: '/', label: 'Dashboard', perm: null },
  { to: '/vms', label: 'Virtual Machines', perm: 'vm.read' },
  { to: '/nodes', label: 'Nodes', perm: 'node.read' },
  { to: '/storage', label: 'Storage', perm: 'storage.read' },
  { to: '/api-keys', label: 'API-Keys', perm: null },
  { to: '/users', label: 'Benutzer & Rollen', perm: 'user.manage' },
  { to: '/audit', label: 'Audit-Log', perm: 'audit.read' },
  { to: '/license', label: 'Lizenz', perm: 'license.read' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  useLiveEvents();

  const [dark, setDark] = useState(() => localStorage.getItem('vcp_theme') !== 'light');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('vcp_theme', dark ? 'dark' : 'light');
  }, [dark]);

  const { data: license } = useQuery({
    queryKey: ['license'],
    queryFn: () => api<LicenseState>('/license/status'),
    enabled: can('license.read'),
    refetchInterval: 5 * 60_000,
  });

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">V</div>
          <span className="text-lg font-semibold tracking-tight">VCP</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav
            .filter((item) => !item.perm || can(item.perm))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 text-sm">
            <div className="font-medium">{user?.name}</div>
            <div className="text-slate-500 dark:text-slate-400">{user?.role}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => setDark(!dark)}>
              {dark ? 'Hell' : 'Dunkel'}
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {license?.status === 'grace' && (
          <div className="bg-amber-500/15 px-6 py-2 text-sm text-amber-700 dark:text-amber-400">
            Lizenzserver nicht erreichbar — Grace Period aktiv ({license.graceRemainingDays} Tage verbleibend).
          </div>
        )}
        {license?.status === 'unlicensed' && (
          <div className="bg-red-500/15 px-6 py-2 text-sm text-red-700 dark:text-red-400">
            Keine gültige Lizenz — VM-Erstellung gesperrt. Bestehende VMs laufen weiter.
          </div>
        )}
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
    </div>
  );
}
