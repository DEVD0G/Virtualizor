import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface TotpSetupResponse {
  secret: string;
  qrDataUrl: string;
  otpauthUri: string;
}

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Konto-Einstellungen</h1>
      <ProfileSection />
      <PasswordSection />
      <TotpSection totpEnabled={user?.totpEnabled ?? false} />
      <SessionsSection />
    </div>
  );
}

function ProfileSection() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const save = useMutation({
    mutationFn: () => api('/auth/me', { method: 'PATCH', body: { name } }),
    onSuccess: () => {
      setMsg({ text: 'Profil gespeichert.', ok: true });
      setTimeout(() => setMsg(null), 4000);
    },
    onError: (e: any) => setMsg({ text: e.message ?? 'Fehler', ok: false }),
  });

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">Profil</h2>
      {msg && (
        <div className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}
      <div className="space-y-3 max-w-xs">
        <div>
          <label className="label">E-Mail</label>
          <input className="input opacity-60 cursor-not-allowed" value={user?.email ?? ''} disabled />
        </div>
        <div>
          <label className="label">Anzeigename</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button
          className="btn-primary"
          disabled={save.isPending || name === user?.name || !name.trim()}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

function PasswordSection() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const change = useMutation({
    mutationFn: () => api('/auth/change-password', {
      method: 'POST',
      body: { currentPassword: form.current, newPassword: form.next },
    }),
    onSuccess: () => {
      setForm({ current: '', next: '', confirm: '' });
      setMsg({ text: 'Passwort geändert.', ok: true });
      setTimeout(() => setMsg(null), 5000);
    },
    onError: (e: any) => setMsg({ text: e.message ?? 'Fehler', ok: false }),
  });

  const mismatch = form.next !== form.confirm && form.confirm.length > 0;
  const canSubmit = form.current.length > 0 && form.next.length >= 10 && form.next === form.confirm && !change.isPending;

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">Passwort ändern</h2>
      {msg && (
        <div className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </div>
      )}
      <div className="space-y-3 max-w-xs">
        <div>
          <label className="label">Aktuelles Passwort</label>
          <input className="input" type="password" value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </div>
        <div>
          <label className="label">Neues Passwort (min. 10 Zeichen)</label>
          <input className="input" type="password" value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })} />
        </div>
        <div>
          <label className="label">Neues Passwort bestätigen</label>
          <input className={`input ${mismatch ? 'border-red-400 focus:ring-red-400' : ''}`} type="password" value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          {mismatch && <p className="mt-1 text-xs text-red-500">Passwörter stimmen nicht überein</p>}
        </div>
        <button className="btn-primary" disabled={!canSubmit} onClick={() => change.mutate()}>
          {change.isPending ? 'Ändere…' : 'Passwort ändern'}
        </button>
      </div>
    </div>
  );
}

function TotpSection({ totpEnabled }: { totpEnabled: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'setup' | 'confirm' | 'disable'>('idle');
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  const setup = useMutation({
    mutationFn: () => api<TotpSetupResponse>('/auth/totp/setup', { method: 'POST' }),
    onSuccess: (data) => { setSetupData(data); setPhase('setup'); setError(''); },
    onError: (e: Error) => setError(e.message),
  });

  const confirm = useMutation({
    mutationFn: () => api('/auth/totp/confirm', { method: 'POST', body: { code } }),
    onSuccess: () => {
      setPhase('idle');
      setSetupData(null);
      setCode('');
      setSuccess('TOTP aktiviert. Die Änderung ist nach der nächsten Anmeldung aktiv.');
      setTimeout(() => setSuccess(''), 6000);
    },
    onError: (e: Error) => { setError(e.message); setCode(''); },
  });

  const disable = useMutation({
    mutationFn: () => api('/auth/totp', { method: 'DELETE', body: { code } }),
    onSuccess: () => {
      setPhase('idle');
      setCode('');
      setSuccess('TOTP deaktiviert.');
      setTimeout(() => setSuccess(''), 4000);
    },
    onError: (e: Error) => { setError(e.message); setCode(''); },
  });

  function copySecret() {
    navigator.clipboard.writeText(setupData?.secret ?? '').catch(() => undefined);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }


  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Zwei-Faktor-Authentifizierung (TOTP)</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Zeitbasierte Einmalcodes über Google Authenticator, Bitwarden, Authy o.ä.
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          totpEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
        }`}>
          {totpEnabled ? 'Aktiv' : 'Inaktiv'}
        </span>
      </div>

      {success && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-400">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ─── Idle: show enable / disable button ──────────────────────────────── */}
      {phase === 'idle' && (
        <div>
          {!totpEnabled ? (
            <button className="btn-primary" onClick={() => { setError(''); setup.mutate(); }} disabled={setup.isPending}>
              {setup.isPending ? 'Generiere…' : 'TOTP einrichten'}
            </button>
          ) : (
            <button className="btn-danger" onClick={() => { setPhase('disable'); setError(''); }}>
              TOTP deaktivieren
            </button>
          )}
        </div>
      )}

      {/* ─── Setup: QR code + manual secret ──────────────────────────────────── */}
      {phase === 'setup' && setupData && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Scanne den QR-Code mit deiner Authenticator-App oder gib den Schlüssel manuell ein.
          </p>
          <div className="flex gap-6 items-start">
            <img src={setupData.qrDataUrl} alt="TOTP QR-Code" className="w-40 h-40 rounded-lg border border-slate-200 dark:border-slate-700" />
            <div className="flex-1 space-y-2">
              <label className="text-xs text-slate-500">Manueller Schlüssel</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-slate-800 px-3 py-2 text-xs font-mono text-slate-200 break-all select-all">
                  {setupData.secret}
                </code>
                <button className="btn-secondary text-xs shrink-0 px-3" onClick={copySecret}>
                  {copiedSecret ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Code bestätigen</label>
            <div className="flex gap-2 max-w-xs">
              <input
                className="input font-mono tracking-widest text-center"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                autoFocus
              />
              <button
                className="btn-primary"
                disabled={code.length !== 6 || confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                {confirm.isPending ? 'Prüfe…' : 'Bestätigen'}
              </button>
            </div>
          </div>
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => { setPhase('idle'); setSetupData(null); setCode(''); }}>
            Abbrechen
          </button>
        </div>
      )}

      {/* ─── Disable: confirm with current code ──────────────────────────────── */}
      {phase === 'disable' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Gib deinen aktuellen Authenticator-Code ein, um TOTP zu deaktivieren.</p>
          <div className="flex gap-2 max-w-xs">
            <input
              className="input font-mono tracking-widest text-center"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              autoFocus
            />
            <button
              className="btn-danger"
              disabled={code.length !== 6 || disable.isPending}
              onClick={() => disable.mutate()}
            >
              {disable.isPending ? 'Deaktiviere…' : 'Deaktivieren'}
            </button>
          </div>
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => { setPhase('idle'); setCode(''); }}>
            Abbrechen
          </button>
        </div>
      )}
    </div>
  );
}

interface Session { id: string; createdAt: string; expiresAt: string }

function SessionsSection() {
  const qc = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => api<Session[]>('/auth/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });

  const revokeAll = useMutation({
    mutationFn: () => api('/auth/sessions', { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Aktive Sitzungen</h2>
        {sessions && sessions.length > 0 && (
          <button
            className="btn-danger text-xs"
            disabled={revokeAll.isPending}
            onClick={() => {
              if (confirm('Alle anderen Sitzungen widerrufen?')) revokeAll.mutate();
            }}
          >
            Alle widerrufen
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500">Aktive Refresh-Token deiner Sitzungen.</p>
      {isLoading && <p className="text-sm text-slate-400">Lade…</p>}
      {sessions && sessions.length === 0 && (
        <p className="text-sm text-slate-400">Keine aktiven Sitzungen.</p>
      )}
      {sessions && sessions.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 text-left font-medium text-slate-600 dark:text-slate-400">Erstellt</th>
              <th className="py-2 text-left font-medium text-slate-600 dark:text-slate-400">Läuft ab</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="py-2 text-xs">{new Date(s.createdAt).toLocaleString()}</td>
                <td className="py-2 text-xs text-slate-500">{new Date(s.expiresAt).toLocaleString()}</td>
                <td className="py-2 text-right">
                  <button
                    className="btn-danger text-xs"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    Widerrufen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
