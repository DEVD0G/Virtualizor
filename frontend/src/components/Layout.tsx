import { useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { LicenseState } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useUiMode } from '../contexts/UiModeContext';
import { useLiveEvents } from '../hooks/useSocket';
import AiPanel from './AiPanel';
import CommandPalette from './CommandPalette';
import LiveTasksPanel from './LiveTasksPanel';
import ToastProvider from './ToastProvider';

const nav = [
  { to: '/', label: 'Dashboard', perm: null },
  { to: '/ai', label: '✦ KI-Assistent', perm: 'vm.read' },
  { to: '/vms', label: 'Virtual Machines', perm: 'vm.read' },
  { to: '/containers', label: 'LXC Container', perm: 'vm.read' },
  { to: '/nodes', label: 'Nodes', perm: 'node.read' },
  { to: '/networks', label: 'Netzwerke', perm: 'network.read' },
  { to: '/storage', label: 'Storage', perm: 'storage.read' },
  { to: '/tasks', label: 'Jobs', perm: 'node.read' },
  { to: '/webhooks', label: 'Webhooks', perm: 'node.read' },
  { to: '/alerts', label: 'Alert-Regeln', perm: 'node.read' },
  { to: '/backup-schedules', label: 'Backup-Zeitpläne', perm: 'vm.manage' },
  { to: '/api-keys', label: 'API-Keys', perm: null },
  { to: '/users', label: 'Benutzer & Rollen', perm: 'user.manage' },
  { to: '/audit', label: 'Audit-Log', perm: 'audit.read' },
  { to: '/system-settings', label: 'Systemeinstellungen', perm: 'user.manage' },
  { to: '/license', label: 'Lizenz', perm: 'license.read' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const { isAssisted, setMode } = useUiMode();
  useLiveEvents();

  const [dark, setDark] = useState(() => localStorage.getItem('vcp_theme') !== 'light');
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('vcp_theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { data: license } = useQuery({
    queryKey: ['license'],
    queryFn: () => api<LicenseState>('/license/status'),
    enabled: can('license.read'),
    refetchInterval: 5 * 60_000,
  });

  return (
    <ToastProvider>
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">V</div>
          <div>
            <span className="text-lg font-semibold tracking-tight">VCP</span>
            {isAssisted && <div className="text-[10px] font-medium text-brand-500 leading-none">Einfacher Modus</div>}
          </div>
        </div>
        <button
          className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
          onClick={() => setPaletteOpen(true)}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="flex-1">Suchen…</span>
          <kbd className="rounded border border-slate-300 px-1 py-px text-[10px] dark:border-slate-600">⌘K</kbd>
        </button>
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
            <NavLink to="/settings" className="btn-secondary flex-1 text-center">Einstellungen</NavLink>
            <button className="btn-secondary" onClick={() => setDark(!dark)} title={dark ? 'Hell' : 'Dunkel'}>
              {dark ? '☀' : '☾'}
            </button>
          </div>
          <button
            className={`mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${isAssisted ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400' : 'border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'}`}
            onClick={() => setMode(isAssisted ? 'professional' : 'assisted')}
          >
            {isAssisted ? '⚙ Profi-Modus' : '✦ Einfacher Modus'}
          </button>
          <button
            className="btn-secondary w-full mt-2"
            onClick={() => { logout(); navigate('/login'); }}
          >
            Logout
          </button>
        </div>
      </aside>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
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
      <AiPanel />
    </div>
    <LiveTasksPanel />
    </ToastProvider>
  );
}
