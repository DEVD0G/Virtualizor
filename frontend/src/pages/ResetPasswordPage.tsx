import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('Passwörter stimmen nicht überein');
      return;
    }
    if (!token) {
      setError('Ungültiger oder fehlender Token');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
      navigate('/login', { replace: true });
    } catch (err: any) {
      setError(err.message ?? 'Fehler beim Zurücksetzen des Passworts');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">V</div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Passwort zurücksetzen</h1>
            <p className="text-xs text-slate-500">Neues Passwort festlegen</p>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Neues Passwort</label>
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Passwort bestätigen</label>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="btn-primary w-full justify-center" disabled={busy || !newPassword || !confirm}>
          {busy ? 'Speichere…' : 'Passwort speichern'}
        </button>
      </form>
    </div>
  );
}
