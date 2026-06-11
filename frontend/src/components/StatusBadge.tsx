const STYLES: Record<string, { dot: string; classes: string }> = {
  running:     { dot: 'bg-emerald-500', classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  online:      { dot: 'bg-emerald-500', classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  active:      { dot: 'bg-emerald-500', classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  succeeded:   { dot: 'bg-emerald-500', classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  stopped:     { dot: 'bg-slate-400',   classes: 'bg-slate-400/15 text-slate-600 dark:text-slate-400' },
  offline:     { dot: 'bg-red-500',     classes: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  error:       { dot: 'bg-red-500',     classes: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  failed:      { dot: 'bg-red-500',     classes: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  unlicensed:  { dot: 'bg-red-500',     classes: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  provisioning:{ dot: 'bg-[var(--brand)]', classes: 'bg-[var(--brand-sub)] text-[var(--brand)]' },
  running_task:{ dot: 'bg-[var(--brand)]', classes: 'bg-[var(--brand-sub)] text-[var(--brand)]' },
  deleting:    { dot: 'bg-amber-500',   classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  paused:      { dot: 'bg-amber-500',   classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  grace:       { dot: 'bg-amber-500',   classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  maintenance: { dot: 'bg-amber-500',   classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  joining:     { dot: 'bg-amber-500',   classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
};

const DEFAULT = { dot: 'bg-slate-400', classes: 'bg-slate-400/15 text-slate-600 dark:text-slate-400' };

export default function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? DEFAULT;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.classes}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
