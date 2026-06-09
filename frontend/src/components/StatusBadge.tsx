const COLORS: Record<string, string> = {
  running: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  online: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  succeeded: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  stopped: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  offline: 'bg-red-500/15 text-red-600 dark:text-red-400',
  error: 'bg-red-500/15 text-red-600 dark:text-red-400',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
  unlicensed: 'bg-red-500/15 text-red-600 dark:text-red-400',
  provisioning: 'bg-brand-500/15 text-brand-600 dark:text-brand-400',
  running_task: 'bg-brand-500/15 text-brand-600 dark:text-brand-400',
  deleting: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  grace: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  maintenance: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  joining: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        COLORS[status] ?? 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
      }`}
    >
      {status}
    </span>
  );
}
