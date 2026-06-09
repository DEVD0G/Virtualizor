import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message ?? 'Anmeldung fehlgeschlagen');
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
