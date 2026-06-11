import { FormEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login, loginTotp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  const Logo = () => (
    <div className="flex items-center gap-3 mb-6">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white"
        style={{ background: 'var(--brand)' }}
      >
        V
      </div>
      <div>
        <div className="text-base font-semibold" style={{ color: 'var(--tx-1)' }}>VCP</div>
        <div className="text-xs" style={{ color: 'var(--tx-3)' }}>Virtualization Control Panel</div>
      </div>
    </div>
  );

  if (pendingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="card w-full max-w-sm">
          <Logo />
          <form onSubmit={submitTotp} className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--tx-1)' }}>Zwei-Faktor</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--tx-3)' }}>Authenticator-Code eingeben</p>
            </div>
            <div>
              <label className="label">6-stelliger Code</label>
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
            <button className="btn-primary w-full" disabled={busy || totpCode.length !== 6}>
              {busy ? 'Prüfe…' : 'Bestätigen'}
            </button>
            <button
              type="button"
              className="w-full text-center text-xs hover:underline"
              style={{ color: 'var(--tx-2)' }}
              onClick={() => { setPendingToken(null); setTotpCode(''); setError(''); }}
            >
              Zurück zur Anmeldung
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="card w-full max-w-sm">
        <Logo />
        <form onSubmit={submitPassword} className="space-y-4">
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
          <div>
            <label className="label">Passwort</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Anmelden…' : 'Anmelden'}
          </button>
          <div className="text-center">
            <Link
              to="/forgot-password"
              className="text-xs hover:underline"
              style={{ color: 'var(--brand)' }}
            >
              Passwort vergessen?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
