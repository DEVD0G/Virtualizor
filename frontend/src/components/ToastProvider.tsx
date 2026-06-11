import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { TaskUpdateEvent } from '../hooks/useSocket';

const KIND_LABELS: Record<string, string> = {
  'vm.provision': 'VM Provision',
  'vm.clone': 'VM Klonen',
  'vm.migrate': 'VM Migration',
  'vm.delete': 'VM Löschen',
  'vm.start': 'VM Start',
  'vm.stop': 'VM Stop',
  'vm.restart': 'VM Neustart',
  'vm.snapshot': 'VM Snapshot',
  'vm.backup': 'VM Backup',
  'vm.restore': 'VM Restore',
  'vm.resize': 'VM Resize',
  'vm.disk-resize': 'Disk Resize',
  'ct.provision': 'CT Provision',
  'ct.start': 'CT Start',
  'ct.stop': 'CT Stop',
  'ct.restart': 'CT Neustart',
  'ct.delete': 'CT Löschen',
};

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; title: string; message?: string }
interface ToastCtx { toast: (kind: ToastKind, title: string, message?: string) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

let _nextId = 0;

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = ++_nextId;
    setToasts((prev) => [...prev.slice(-4), { id, kind, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    function onTaskUpdate(e: Event) {
      const task = (e as CustomEvent<TaskUpdateEvent>).detail;
      if (task.state === 'succeeded') {
        toast('success', KIND_LABELS[task.kind] ?? task.kind, `${task.resourceType}/${task.resourceId.slice(0, 8)} abgeschlossen`);
      } else if (task.state === 'failed') {
        toast('error', `${KIND_LABELS[task.kind] ?? task.kind} fehlgeschlagen`, task.error ?? 'Unbekannter Fehler');
      }
    }
    window.addEventListener('vcp:task:update', onTaskUpdate);
    return () => window.removeEventListener('vcp:task:update', onTaskUpdate);
  }, [toast]);

  const ICON = { success: '✓', error: '✗', info: 'ℹ' } as const;

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${
              t.kind === 'success'
                ? 'bg-emerald-600 text-white'
                : t.kind === 'error'
                ? 'bg-red-600 text-white'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--tx-1)]'
            }`}
          >
            <span className="shrink-0 text-base font-bold">{ICON[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t.title}</div>
              {t.message && <div className="mt-0.5 break-words text-xs opacity-80">{t.message}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
