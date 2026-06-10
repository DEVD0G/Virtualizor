import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Task } from '../api/types';
import { useLiveEvents } from '../hooks/useSocket';

const KIND_LABELS: Record<string, string> = {
  'vm.provision': 'Provision',
  'vm.start': 'Start',
  'vm.stop': 'Stop',
  'vm.restart': 'Restart',
  'vm.delete': 'Löschen',
  'vm.snapshot': 'Snapshot',
  'vm.snapshot-revert': 'Snapshot Revert',
  'vm.snapshot-delete': 'Snapshot Delete',
  'vm.backup': 'Backup',
  'vm.resize': 'Resize',
  'vm.disk-resize': 'Disk Resize',
};

function StateChip({ state }: { state: Task['state'] }) {
  const cls: Record<Task['state'], string> = {
    queued: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    succeeded: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  };
  const labels: Record<Task['state'], string> = {
    queued: 'Wartend', running: 'Läuft', succeeded: 'Fertig', failed: 'Fehler',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls[state]}`}>
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

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks?limit=100'),
    refetchInterval: 5_000,
  });

  const running = tasks.filter((t) => t.state === 'running' || t.state === 'queued');
  const done    = tasks.filter((t) => t.state === 'succeeded' || t.state === 'failed');

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

      {running.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Aktive Jobs</h2>
          {running.map((t) => (
            <div key={t.id} className="flex items-center gap-4">
              <StateChip state={t.state} />
              <span className="flex-1 text-sm font-medium">{KIND_LABELS[t.kind] ?? t.kind}</span>
              <Link to={`/vms/${t.resourceId}`} className="text-xs text-brand-500 hover:underline">{t.resourceId.slice(0, 8)}…</Link>
              <div className="w-32 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${t.progress}%` }} />
              </div>
              <span className="w-8 text-right text-xs text-slate-500">{t.progress}%</span>
              <span className="text-xs text-slate-400">{duration(t.createdAt, null)}</span>
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
            {isLoading && <tr><td colSpan={6} className="text-center text-slate-400">Lade…</td></tr>}
            {done.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">{KIND_LABELS[t.kind] ?? t.kind}</td>
                <td>
                  <Link to={`/${t.resourceType}s/${t.resourceId}`} className="font-mono text-xs text-brand-500 hover:underline">
                    {t.resourceId.slice(0, 8)}…
                  </Link>
                </td>
                <td><StateChip state={t.state} /></td>
                <td className="text-xs text-slate-500">{duration(t.createdAt, t.finishedAt)}</td>
                <td className="text-xs text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
                <td className="max-w-[200px] truncate text-xs text-red-500">{t.error ?? ''}</td>
              </tr>
            ))}
            {!isLoading && !done.length && (
              <tr><td colSpan={6} className="text-center text-slate-400">Keine abgeschlossenen Jobs</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
