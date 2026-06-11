import { useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect, useRef, useState } from 'react';
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

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const ic = (d: string, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const Icons = {
  Home:      () => ic('m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10'),
  Sparkle:   () => ic('M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z'),
  Server:    () => ic('M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M2 15a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M6 10h.01 M6 18h.01'),
  Box:       () => ic('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96 12 12.01l8.73-5.05 M12 22.08V12'),
  Database:  () => ic('M12 2C6.48 2 2 3.79 2 6v4c0 2.21 4.48 4 10 4s10-1.79 10-4V6c0-2.21-4.48-4-10-4z M2 10v4c0 2.21 4.48 4 10 4s10-1.79 10-4v-4 M2 14v4c0 2.21 4.48 4 10 4s10-1.79 10-4v-4'),
  Cpu:       () => ic('M9 3H5a2 2 0 0 0-2 2v4 M9 21H5a2 2 0 0 1-2-2v-4 M15 3h4a2 2 0 0 1 2 2v4 M15 21h4a2 2 0 0 0 2-2v-4 M9 9h6v6H9z M9 1v2 M15 1v2 M9 21v2 M15 21v2 M1 9h2 M1 15h2 M21 9h2 M21 15h2'),
  Network:   () => ic('M9 3H5a2 2 0 0 0-2 2v4 M9 3h6 M15 3h4a2 2 0 0 1 2 2v4 M3 9v6 M21 9v6 M3 15v2a2 2 0 0 0 2 2h4 M21 15v2a2 2 0 0 1-2 2h-4 M9 21h6'),
  Clock:     () => ic('M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M12 6v6l4 2'),
  Calendar:  () => ic('M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M1 10h22'),
  Bell:      () => ic('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0'),
  Link:      () => ic('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
  Users:     () => ic('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75'),
  Key:       () => ic('M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4'),
  Shield:    () => ic('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'),
  Settings:  () => ic('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'),
  Badge:     () => ic('M12 2L8 6H4l1 5-3 3 3 3-1 5h4l4 4 4-4h4l-1-5 3-3-3-3 1-5h-4z M12 8v4l2 2'),
  Sun:       () => ic('M12 17A5 5 0 1 0 12 7a5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42'),
  Moon:      () => ic('M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'),
  Search:    () => ic('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35'),
  Menu:      () => ic('M3 12h18 M3 6h18 M3 18h18'),
  X:         () => ic('M18 6L6 18 M6 6l12 12'),
  Logout:    () => ic('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9'),
  ChevronRight: () => ic('M9 18l6-6-6-6', 14),
};

// ─── Navigation structure ────────────────────────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: () => JSX.Element;
  perm: string | null;
  end?: boolean;
}
interface NavSection { title: string | null; items: NavItem[] }

const NAV: NavSection[] = [
  {
    title: null,
    items: [
      { to: '/',   label: 'Dashboard',     icon: Icons.Home,    perm: null, end: true },
      { to: '/ai', label: 'KI-Assistent',  icon: Icons.Sparkle, perm: 'vm.read' },
    ],
  },
  {
    title: 'Ressourcen',
    items: [
      { to: '/vms',        label: 'Virtual Machines', icon: Icons.Server,   perm: 'vm.read' },
      { to: '/containers', label: 'LXC Container',    icon: Icons.Box,      perm: 'vm.read' },
      { to: '/storage',    label: 'Storage',          icon: Icons.Database, perm: 'storage.read' },
    ],
  },
  {
    title: 'Infrastruktur',
    items: [
      { to: '/nodes',    label: 'Nodes',    icon: Icons.Cpu,     perm: 'node.read' },
      { to: '/networks', label: 'Netzwerke', icon: Icons.Network, perm: 'network.read' },
    ],
  },
  {
    title: 'Betrieb',
    items: [
      { to: '/tasks',            label: 'Jobs',            icon: Icons.Clock,    perm: 'node.read' },
      { to: '/backup-schedules', label: 'Backup-Zeitpläne', icon: Icons.Calendar, perm: 'vm.manage' },
      { to: '/alerts',           label: 'Alert-Regeln',    icon: Icons.Bell,     perm: 'node.read' },
      { to: '/webhooks',         label: 'Webhooks',        icon: Icons.Link,     perm: 'node.read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users',           label: 'Benutzer & Rollen',  icon: Icons.Users,    perm: 'user.manage' },
      { to: '/api-keys',        label: 'API-Keys',           icon: Icons.Key,      perm: null },
      { to: '/audit',           label: 'Audit-Log',          icon: Icons.Shield,   perm: 'audit.read' },
      { to: '/system-settings', label: 'Systemeinstellungen', icon: Icons.Settings, perm: 'user.manage' },
      { to: '/license',         label: 'Lizenz',             icon: Icons.Badge,    perm: 'license.read' },
    ],
  },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { can, user, logout } = useAuth();
  const navigate = useNavigate();
  const { isAssisted, setMode } = useUiMode();
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

  return (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Logo */}
      <div className="flex items-center justify-between px-4 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl font-bold text-white text-sm"
            style={{ background: 'var(--brand)' }}>
            V
          </div>
          <div className="leading-none">
            <div className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--tx-1)' }}>VCP</div>
            {isAssisted && (
              <div className="mt-0.5 text-[10px] font-medium" style={{ color: 'var(--brand)' }}>Einfacher Modus</div>
            )}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn-ghost h-7 w-7 rounded-lg p-0 lg:hidden">
            <Icons.X />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--tx-3)' }}
          onClick={() => setPaletteOpen(true)}
        >
          <Icons.Search />
          <span className="flex-1 text-left text-xs">Suchen…</span>
          <kbd className="hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline-block"
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--tx-3)' }}>
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {NAV.map((section, si) => {
          const visible = section.items.filter((i) => !i.perm || can(i.perm));
          if (!visible.length) return null;
          return (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {section.title && (
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--tx-3)' }}>
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {visible.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) => isActive ? 'nav-item-active' : 'nav-item'}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="px-3 pb-4 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        {/* User info */}
        <div className="mb-3 flex items-center gap-2.5 px-1 pt-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: 'var(--brand)' }}>
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" style={{ color: 'var(--tx-1)' }}>{user?.name}</div>
            <div className="truncate text-xs" style={{ color: 'var(--tx-3)' }}>{user?.role}</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn-secondary text-xs py-1.5 px-2 rounded-lg"
            onClick={() => { setDark(!dark); }} title={dark ? 'Hell-Modus' : 'Dunkel-Modus'}>
            {dark ? <><Icons.Sun /> Hell</> : <><Icons.Moon /> Dunkel</>}
          </button>
          <button
            className="btn-secondary text-xs py-1.5 px-2 rounded-lg"
            onClick={() => setMode(isAssisted ? 'professional' : 'assisted')}
            title={isAssisted ? 'Wechsle zu Profi-Modus' : 'Wechsle zu Einfachem Modus'}
          >
            {isAssisted ? '⚙ Profi' : '✦ Einfach'}
          </button>
        </div>
        <NavLink to="/settings" onClick={onClose}
          className="btn-ghost mt-1.5 w-full rounded-lg text-xs justify-start gap-2 py-1.5 px-2">
          <Icons.Settings />
          <span>Einstellungen</span>
        </NavLink>
        <button
          className="mt-1 w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
          style={{ color: '#ef4444' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          onClick={() => { logout(); navigate('/login'); }}
        >
          <Icons.Logout />
          Abmelden
        </button>
      </div>
    </>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  useLiveEvents();

  const { data: license } = useQuery({
    queryKey: ['license'],
    queryFn: () => api<LicenseState>('/license/status'),
    enabled: can('license.read'),
    refetchInterval: 5 * 60_000,
  });

  // Close sidebar on overlay click
  function handleOverlay(e: React.MouseEvent) {
    if (e.target === overlayRef.current) setSidebarOpen(false);
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>

        {/* ── Desktop Sidebar ── */}
        <aside
          className="hidden lg:flex w-[240px] shrink-0 flex-col sticky top-0 h-screen overflow-hidden"
          style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
        >
          <Sidebar />
        </aside>

        {/* ── Mobile Sidebar Overlay ── */}
        {sidebarOpen && (
          <div
            ref={overlayRef}
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={handleOverlay}
          >
            <aside
              className="flex h-full w-[260px] flex-col animate-slide-in-left"
              style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </aside>
          </div>
        )}

        {/* ── Main ── */}
        <div className="flex min-w-0 flex-1 flex-col">

          {/* Mobile top bar */}
          <header
            className="flex items-center gap-3 px-4 py-3 lg:hidden sticky top-0 z-30"
            style={{
              background: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <button
              className="btn-ghost h-9 w-9 rounded-xl p-0"
              onClick={() => setSidebarOpen(true)}
              aria-label="Menü öffnen"
            >
              <Icons.Menu />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ background: 'var(--brand)' }}>V</div>
              <span className="text-[15px] font-semibold" style={{ color: 'var(--tx-1)' }}>VCP</span>
            </div>
          </header>

          {/* License banners */}
          {license?.status === 'grace' && (
            <div className="px-6 py-2.5 text-sm font-medium"
              style={{ background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)', color: '#b45309' }}>
              ⚠ Lizenzserver nicht erreichbar — Grace Period aktiv ({license.graceRemainingDays} Tage verbleibend).
            </div>
          )}
          {license?.status === 'unlicensed' && (
            <div className="px-6 py-2.5 text-sm font-medium"
              style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)', color: '#dc2626' }}>
              ✕ Keine gültige Lizenz — VM-Erstellung gesperrt. Bestehende VMs laufen weiter.
            </div>
          )}

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8 animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>

      <AiPanel />
      <LiveTasksPanel />
    </ToastProvider>
  );
}
