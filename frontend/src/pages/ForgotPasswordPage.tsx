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
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="card w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white"
            style={{ background: 'var(--brand)' }}
          >
            V
          </div>
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--tx-1)' }}>
              Passwort vergessen
            </h1>
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>Link zum Zurücksetzen anfordern</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              E-Mail gesendet! Bitte prüfen Sie Ihr Postfach.
            </p>
            <Link
              to="/login"
              className="text-xs hover:underline"
              style={{ color: 'var(--brand)' }}
            >
              Zurück zur Anmeldung
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">E-Mail</label>
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
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Sende…' : 'Link anfordern'}
            </button>
            <div className="text-center">
              <Link
                to="/login"
                className="text-xs hover:underline"
                style={{ color: 'var(--tx-2)' }}
              >
                Zurück zur Anmeldung
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
