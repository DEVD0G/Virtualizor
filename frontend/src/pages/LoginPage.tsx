import { FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login, loginTotp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // TOTP second-step state
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const totpRef = useRef<HTMLInputElement>(null);

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await login(email, password);
      if (result.type === 'totp') {
        setPendingToken(result.pendingToken);
        setTimeout(() => totpRef.current?.focus(), 50);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message ?? 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingToken) return;
    setBusy(true);
    setError('');
    try {
      await loginTotp(pendingToken, totpCode);
      navigate('/');
    } catch (err: any) {
      setError(err.message ?? 'Ungültiger Code');
      setTotpCode('');
      totpRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  // ─── TOTP step ───────────────────────────────────────────────────────────────
  if (pendingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <form onSubmit={submitTotp} className="card w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">V</div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Zwei-Faktor</h1>
              <p className="text-xs text-slate-500">Authenticator-Code eingeben</p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">6-stelliger Code</label>
            <input
              ref={totpRef}
              className="input text-center font-mono tracking-widest text-lg"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoComplete="one-time-code"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button className="btn-primary w-full justify-center" disabled={busy || totpCode.length !== 6}>
            {busy ? 'Prüfe…' : 'Bestätigen'}
          </button>
          <button
            type="button"
            className="w-full text-center text-xs text-slate-500 hover:underline"
            onClick={() => { setPendingToken(null); setTotpCode(''); setError(''); }}
          >
            Zurück zur Anmeldung
          </button>
        </form>
      </div>
    );
  }

  // ─── Password step ───────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <form onSubmit={submitPassword} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">V</div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">VCP</h1>
            <p className="text-xs text-slate-500">Virtualization Control Panel</p>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">E-Mail</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Passwort</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
