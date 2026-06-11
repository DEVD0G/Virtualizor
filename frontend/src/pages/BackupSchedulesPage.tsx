import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { CronSchedule } from '../api/types';
import { useToast } from '../components/ToastProvider';

const CRON_PRESETS = [
  { label: 'Täglich 2:00', value: '0 2 * * *' },
  { label: 'Wöchentlich So', value: '0 2 * * 0' },
  { label: 'Stündlich', value: '0 * * * *' },
  { label: 'Monatlich', value: '0 2 1 * *' },
] as const;

export default function BackupSchedulesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['backup-schedules'],
    queryFn: () => api<CronSchedule[]>('/backup-schedules'),
  });

  const toggle = useMutation({
    mutationFn: (id: string) =>
      api<CronSchedule>(`/backup-schedules/${id}/toggle`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backup-schedules'] }),
    onError: (e: any) => toast('error', 'Fehler', e?.message),
  });

  const runNow = useMutation({
    mutationFn: (id: string) =>
      api(`/backup-schedules/${id}/run`, { method: 'POST' }),
    onSuccess: () => {
      toast('success', 'Backup gestartet');
      qc.invalidateQueries({ queryKey: ['backup-schedules'] });
    },
    onError: (e: any) => toast('error', 'Fehler beim Starten', e?.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/backup-schedules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('success', 'Zeitplan gelöscht');
      qc.invalidateQueries({ queryKey: ['backup-schedules'] });
    },
    onError: (e: any) => toast('error', 'Fehler beim Löschen', e?.message),
  });

  function handleDelete(id: string) {
    if (window.confirm('Zeitplan wirklich löschen?')) {
      remove.mutate(id);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Backup-Zeitpläne</h1>
        <button
          className="btn-primary"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Abbrechen' : 'Neuer Zeitplan'}
        </button>
      </div>

      {showForm && (
        <NewScheduleForm onClose={() => setShowForm(false)} />
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Ziel</th>
              <th>Cron</th>
              <th>Behalten</th>
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="text-center" style={{ color: 'var(--tx-3)' }}>
                  Lade…
                </td>
              </tr>
            )}
            {!isLoading && !schedules?.length && (
              <tr>
                <td colSpan={6} className="text-center" style={{ color: 'var(--tx-3)' }}>
                  Keine Backup-Zeitpläne vorhanden
                </td>
              </tr>
            )}
            {schedules?.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td className="font-mono text-xs" style={{ color: 'var(--tx-2)' }}>
                  {s.targetType.toUpperCase()} / {s.targetId.slice(0, 8)}
                </td>
                <td>
                  <code className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--surface-2)' }}>
                    {s.cronExpr}
                  </code>
                </td>
                <td className="text-sm">{s.keepLast}x</td>
                <td>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.enabled
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : ''
                    }`}
                    style={!s.enabled ? { background: 'var(--surface-2)', color: 'var(--tx-2)' } : undefined}
                  >
                    {s.enabled ? 'Aktiv' : 'Pausiert'}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-secondary text-xs"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(s.id)}
                    >
                      {s.enabled ? 'Pausieren' : 'Aktivieren'}
                    </button>
                    <button
                      className="btn-secondary text-xs"
                      disabled={runNow.isPending}
                      onClick={() => runNow.mutate(s.id)}
                    >
                      {runNow.isPending ? '…' : 'Jetzt'}
                    </button>
                    <button
                      className="btn-danger text-xs"
                      disabled={remove.isPending}
                      onClick={() => handleDelete(s.id)}
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewScheduleForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<'vm' | 'ct'>('vm');
  const [targetId, setTargetId] = useState('');
  const [cronExpr, setCronExpr] = useState('0 2 * * *');
  const [keepLast, setKeepLast] = useState(3);

  const create = useMutation({
    mutationFn: () =>
      api<CronSchedule>('/backup-schedules', {
        method: 'POST',
        body: { name, targetType, targetId, cronExpr, keepLast },
      }),
    onSuccess: () => {
      toast('success', 'Zeitplan erstellt');
      qc.invalidateQueries({ queryKey: ['backup-schedules'] });
      onClose();
    },
    onError: (e: any) => toast('error', 'Fehler beim Erstellen', e?.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !targetId.trim()) return;
    create.mutate();
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">Neuer Zeitplan</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <div>
          <label className="label">Name *</label>
          <input
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="label">Ziel-Typ</label>
            <select
              className="input"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as 'vm' | 'ct')}
            >
              <option value="vm">VM</option>
              <option value="ct">CT</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="label">Ziel-ID *</label>
            <input
              className="input font-mono"
              required
              placeholder="ID der VM oder des Containers"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Cron-Ausdruck</label>
          <input
            className="input font-mono"
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  cronExpr === p.value
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : ''
                }`}
              style={cronExpr !== p.value ? { borderColor: 'var(--border)', color: 'var(--tx-2)' } : undefined}
                onClick={() => setCronExpr(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Behalten (Anzahl)</label>
          <input
            className="input w-24"
            type="number"
            min={1}
            max={100}
            value={keepLast}
            onChange={(e) => setKeepLast(parseInt(e.target.value, 10) || 3)}
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={create.isPending || !name.trim() || !targetId.trim()}
          >
            {create.isPending ? 'Erstelle…' : 'Zeitplan erstellen'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
