import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Task } from '../api/types';
import { useLiveEvents } from '../hooks/useSocket';

const KIND_LABELS: Record<string, string> = {
  'vm.provision': 'VM Provision',
  'vm.start': 'VM Start',
  'vm.stop': 'VM Stop',
  'vm.restart': 'VM Neustart',
  'vm.delete': 'VM Löschen',
  'vm.snapshot': 'VM Snapshot',
  'vm.snapshot-revert': 'Snapshot Revert',
  'vm.snapshot-delete': 'Snapshot Löschen',
  'vm.backup': 'VM Backup',
  'vm.restore': 'VM Restore',
  'vm.resize': 'VM Resize',
  'vm.disk-resize': 'Disk Resize',
  'vm.migrate': 'VM Migration',
  'vm.clone': 'VM Klonen',
  'ct.provision': 'CT Provision',
  'ct.start': 'CT Start',
  'ct.stop': 'CT Stop',
  'ct.restart': 'CT Neustart',
  'ct.delete': 'CT Löschen',
};

function StateChip({ state }: { state: Task['state'] }) {
  const cls: Record<Task['state'], string> = {
    queued: '',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    succeeded: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  };
  const stateStyle: Record<Task['state'], React.CSSProperties> = {
    queued: { background: 'var(--surface-2)', color: 'var(--tx-2)' },
    running: {},
    succeeded: {},
    failed: {},
  };
  const labels: Record<Task['state'], string> = {
    queued: 'Wartend', running: 'Läuft', succeeded: 'Fertig', failed: 'Fehler',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls[state]}`} style={stateStyle[state]}>
      {labels[state]}
    </span>
  );
}

function duration(start: string, end: string | null) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export default function TasksPage() {
  useLiveEvents();

  const [kindFilter, setKindFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks?limit=200'),
    refetchInterval: 5_000,
  });

  const allKinds = useMemo(() => [...new Set(tasks.map((t) => t.kind))].sort(), [tasks]);
  const allResourceTypes = useMemo(() => [...new Set(tasks.map((t) => t.resourceType))].sort(), [tasks]);

  const filtered = useMemo(() => tasks.filter((t) => {
    if (kindFilter && t.kind !== kindFilter) return false;
    if (stateFilter && t.state !== stateFilter) return false;
    if (resourceTypeFilter && t.resourceType !== resourceTypeFilter) return false;
    return true;
  }), [tasks, kindFilter, stateFilter, resourceTypeFilter]);

  const running = filtered.filter((t) => t.state === 'running' || t.state === 'queued');
  const done    = filtered.filter((t) => t.state === 'succeeded' || t.state === 'failed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        {running.length > 0 && (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
            {running.length} aktiv
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="input w-48">
          <option value="">Alle Typen</option>
          {allKinds.map((k) => <option key={k} value={k}>{KIND_LABELS[k] ?? k}</option>)}
        </select>
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="input w-36">
          <option value="">Alle Status</option>
          <option value="queued">Wartend</option>
          <option value="running">Läuft</option>
          <option value="succeeded">Fertig</option>
          <option value="failed">Fehler</option>
        </select>
        <select value={resourceTypeFilter} onChange={(e) => setResourceTypeFilter(e.target.value)} className="input w-36">
          <option value="">Alle Ressourcen</option>
          {allResourceTypes.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {(kindFilter || stateFilter || resourceTypeFilter) && (
          <button className="btn-secondary"
            onClick={() => { setKindFilter(''); setStateFilter(''); setResourceTypeFilter(''); }}>
            Zurücksetzen
          </button>
        )}
        <span className="ml-auto self-center text-sm" style={{ color: 'var(--tx-2)' }}>
          {filtered.length} von {tasks.length} Jobs
        </span>
      </div>

      {running.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--tx-2)' }}>Aktive Jobs</h2>
          {running.map((t) => (
            <div key={t.id} className="flex items-center gap-4">
              <StateChip state={t.state} />
              <span className="flex-1 text-sm font-medium">{KIND_LABELS[t.kind] ?? t.kind}</span>
              <Link to={`/vms/${t.resourceId}`} className="text-xs hover:underline" style={{ color: 'var(--brand)' }}>{t.resourceId.slice(0, 8)}…</Link>
              <div className="w-32 h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${t.progress}%`, background: 'var(--brand)' }} />
              </div>
              <span className="w-8 text-right text-xs" style={{ color: 'var(--tx-2)' }}>{t.progress}%</span>
              <span className="text-xs" style={{ color: 'var(--tx-3)' }}>{duration(t.createdAt, null)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr><th>Job</th><th>Ressource</th><th>Status</th><th>Dauer</th><th>Erstellt</th><th>Fehler</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center" style={{ color: 'var(--tx-3)' }}>Lade…</td></tr>}
            {done.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">{KIND_LABELS[t.kind] ?? t.kind}</td>
                <td>
                  <Link to={`/${t.resourceType}s/${t.resourceId}`} className="font-mono text-xs hover:underline" style={{ color: 'var(--brand)' }}>
                    {t.resourceId.slice(0, 8)}…
                  </Link>
                </td>
                <td><StateChip state={t.state} /></td>
                <td className="text-xs" style={{ color: 'var(--tx-2)' }}>{duration(t.createdAt, t.finishedAt)}</td>
                <td className="text-xs" style={{ color: 'var(--tx-2)' }}>{new Date(t.createdAt).toLocaleString()}</td>
                <td className="max-w-[200px] truncate text-xs text-red-500">{t.error ?? ''}</td>
              </tr>
            ))}
            {!isLoading && !done.length && (
              <tr><td colSpan={6} className="text-center" style={{ color: 'var(--tx-3)' }}>Keine abgeschlossenen Jobs</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
