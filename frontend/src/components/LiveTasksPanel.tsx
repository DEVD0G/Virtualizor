import { useEffect, useState } from 'react';
import { TaskUpdateEvent } from '../hooks/useSocket';

const KIND_LABELS: Record<string, string> = {
  'vm.provision': 'VM Provision',
  'vm.clone': 'VM Klonen',
  'vm.migrate': 'VM Migration',
  'vm.delete': 'VM Löschen',
  'vm.start': 'VM Start',
  'vm.stop': 'VM Stop',
  'vm.restart': 'VM Neustart',
  'vm.snapshot': 'Snapshot',
  'vm.backup': 'Backup',
  'vm.restore': 'Restore',
  'vm.resize': 'Resize',
  'vm.disk-resize': 'Disk Resize',
  'ct.provision': 'CT Provision',
  'ct.start': 'CT Start',
  'ct.stop': 'CT Stop',
  'ct.restart': 'CT Neustart',
  'ct.delete': 'CT Löschen',
};

interface ActiveTask {
  id: string;
  kind: string;
  resourceType: string;
  resourceId: string;
  state: TaskUpdateEvent['state'];
  progress: number;
  error?: string | null;
  doneAt?: number;
}

export default function LiveTasksPanel() {
  const [tasks, setTasks] = useState<ActiveTask[]>([]);

  useEffect(() => {
    function onUpdate(e: Event) {
      const t = (e as CustomEvent<TaskUpdateEvent>).detail;
      setTasks((prev) => {
        const existing = prev.find((x) => x.id === t.id);
        const updated: ActiveTask = {
          id: t.id,
          kind: t.kind,
          resourceType: t.resourceType,
          resourceId: t.resourceId,
          state: t.state,
          progress: t.progress,
          error: t.error,
          doneAt: t.state === 'succeeded' || t.state === 'failed' ? Date.now() : existing?.doneAt,
        };
        if (existing) {
          return prev.map((x) => (x.id === t.id ? updated : x));
        }
        return [...prev.slice(-9), updated];
      });
    }
    window.addEventListener('vcp:task:update', onUpdate);
    return () => window.removeEventListener('vcp:task:update', onUpdate);
  }, []);

  // Auto-remove completed tasks after 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 4000;
      setTasks((prev) => prev.filter((t) => !t.doneAt || t.doneAt > cutoff));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeTasks = tasks.filter((t) => t.state === 'running' || t.state === 'queued');
  const recentDone = tasks.filter((t) => t.doneAt);

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-72 space-y-1.5">
      {[...activeTasks, ...recentDone].map((t) => {
        const isDone = t.state === 'succeeded' || t.state === 'failed';
        const isError = t.state === 'failed';
        return (
          <div
            key={t.id}
            className={`rounded-lg border px-3 py-2 shadow-lg text-xs transition-all ${
              isError
                ? 'border-red-500/30 bg-red-500/10 dark:bg-red-900/20'
                : isDone
                ? 'border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-900/20'
                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`font-medium ${isError ? 'text-red-600 dark:text-red-400' : isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                {KIND_LABELS[t.kind] ?? t.kind}
              </span>
              <span className="text-slate-400 font-mono shrink-0">{t.resourceId.slice(0, 8)}</span>
            </div>
            {!isDone && (
              <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-1 rounded-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${t.progress}%` }}
                />
              </div>
            )}
            {isDone && (
              <div className={`text-xs ${isError ? 'text-red-500' : 'text-emerald-500'}`}>
                {isError ? (t.error ?? 'Fehler') : 'Abgeschlossen'}
              </div>
            )}
            {!isDone && (
              <div className="mt-1 text-right text-slate-400">{t.progress}%</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
