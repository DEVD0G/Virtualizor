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
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <form onSubmit={submit} className="card w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white"
            style={{ background: 'var(--brand)' }}
          >
            V
          </div>
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--tx-1)' }}>
              Passwort zurücksetzen
            </h1>
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>Neues Passwort festlegen</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Neues Passwort</label>
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
            <label className="label">Passwort bestätigen</label>
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
          <button
            className="btn-primary w-full"
            disabled={busy || !newPassword || !confirm}
          >
            {busy ? 'Speichere…' : 'Passwort speichern'}
          </button>
        </div>
      </form>
    </div>
  );
}
