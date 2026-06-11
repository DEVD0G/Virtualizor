import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? 'Fehler beim Senden der E-Mail');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">V</div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Passwort vergessen</h1>
            <p className="text-xs text-slate-500">Link zum Zurücksetzen anfordern</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-green-600 dark:text-green-400">
              E-Mail gesendet! Bitte prüfen Sie Ihr Postfach.
            </p>
            <Link to="/login" className="text-xs text-brand-500 hover:underline">
              Zurück zur Anmeldung
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">E-Mail</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button className="btn-primary w-full justify-center" disabled={busy}>
              {busy ? 'Sende…' : 'Link anfordern'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-xs text-slate-500 hover:underline">
                Zurück zur Anmeldung
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
