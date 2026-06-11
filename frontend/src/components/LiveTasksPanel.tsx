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
          id: t.id, kind: t.kind, resourceType: t.resourceType,
          resourceId: t.resourceId, state: t.state,
          progress: t.progress, error: t.error,
          doneAt: t.state === 'succeeded' || t.state === 'failed' ? Date.now() : existing?.doneAt,
        };
        if (existing) return prev.map((x) => (x.id === t.id ? updated : x));
        return [...prev.slice(-9), updated];
      });
    }
    window.addEventListener('vcp:task:update', onUpdate);
    return () => window.removeEventListener('vcp:task:update', onUpdate);
  }, []);

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
            className="rounded-xl px-3 py-2.5 text-xs shadow-lg transition-all"
            style={{
              background: isError
                ? 'rgba(239,68,68,0.1)'
                : isDone
                ? 'rgba(34,197,94,0.1)'
                : 'var(--surface)',
              border: `1px solid ${isError ? 'rgba(239,68,68,0.25)' : isDone ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
            }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span
                className="font-semibold"
                style={{
                  color: isError ? '#ef4444' : isDone ? '#22c55e' : 'var(--tx-1)',
                }}
              >
                {KIND_LABELS[t.kind] ?? t.kind}
              </span>
              <span className="shrink-0 font-mono" style={{ color: 'var(--tx-3)' }}>
                {t.resourceId.slice(0, 8)}
              </span>
            </div>
            {!isDone && (
              <div className="h-1 w-full rounded-full" style={{ background: 'var(--border)' }}>
                <div
                  className="h-1 rounded-full transition-all duration-500"
                  style={{ width: `${t.progress}%`, background: 'var(--brand)' }}
                />
              </div>
            )}
            {isDone ? (
              <div className="text-xs" style={{ color: isError ? '#ef4444' : '#22c55e' }}>
                {isError ? (t.error ?? 'Fehler') : 'Abgeschlossen'}
              </div>
            ) : (
              <div className="mt-1 text-right" style={{ color: 'var(--tx-3)' }}>{t.progress}%</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
