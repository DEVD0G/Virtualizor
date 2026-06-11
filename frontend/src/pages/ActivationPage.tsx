import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SystemStateResponse {
  phase: 'locked' | 'activating' | 'active';
  installId: string;
  fingerprint: string;
  licenseState: {
    status: string;
    tier: string | null;
  };
  apiConfigured: boolean;
}

export default function ActivationPage() {
  const navigate = useNavigate();

  const [systemState, setSystemState] = useState<SystemStateResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Copy-to-clipboard feedback timers
  const copyInstallIdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyFingerprintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedInstallId, setCopiedInstallId] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // ─── Fetch system state on mount ────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchState() {
      try {
        const res = await fetch('/api/v1/license/system-state');
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        const data: SystemStateResponse = await res.json();
        if (cancelled) return;
        setSystemState(data);

        if (data.phase === 'active') {
          navigate('/', { replace: true });
        }
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message ?? 'Failed to load system state');
      }
    }

    fetchState();
    return () => { cancelled = true; };
  }, [navigate]);

  // ─── Redirect after success ──────────────────────────────────────────────────

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => navigate('/', { replace: true }), 2000);
    return () => clearTimeout(t);
  }, [success, navigate]);

  // ─── Clipboard helpers ───────────────────────────────────────────────────────

  function copyText(text: string, which: 'installId' | 'fingerprint') {
    navigator.clipboard.writeText(text).catch(() => undefined);
    if (which === 'installId') {
      setCopiedInstallId(true);
      if (copyInstallIdTimer.current) clearTimeout(copyInstallIdTimer.current);
      copyInstallIdTimer.current = setTimeout(() => setCopiedInstallId(false), 2000);
    } else {
      setCopiedFingerprint(true);
      if (copyFingerprintTimer.current) clearTimeout(copyFingerprintTimer.current);
      copyFingerprintTimer.current = setTimeout(() => setCopiedFingerprint(false), 2000);
    }
  }

  // ─── Activate ────────────────────────────────────────────────────────────────

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!licenseKey.trim() || activating) return;
    setActivating(true);
    setActivateError(null);

    try {
      const res = await fetch('/api/v1/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKey.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message: string =
          body?.message ??
          body?.error ??
          `Activation failed (HTTP ${res.status})`;
        throw new Error(Array.isArray(message) ? message.join('; ') : message);
      }

      setSuccess(true);
    } catch (err: any) {
      setActivateError(err.message ?? 'Unknown error');
    } finally {
      setActivating(false);
    }
  }

  // ─── Self-Hosted activation (no license server configured) ─────────────────

  async function handleSelfHosted() {
    if (activating) return;
    setActivating(true);
    setActivateError(null);

    try {
      const res = await fetch('/api/v1/license/activate-self-hosted', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message: string = body?.message ?? `Aktivierung fehlgeschlagen (HTTP ${res.status})`;
        throw new Error(Array.isArray(message) ? message.join('; ') : message);
      }
      setSuccess(true);
    } catch (err: any) {
      setActivateError(err.message ?? 'Unbekannter Fehler');
    } finally {
      setActivating(false);
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────

  function abbreviateFingerprint(fp: string): string {
    if (fp.length <= 20) return fp;
    return `${fp.slice(0, 16)}...`;
  }

  // ─── Loading state ───────────────────────────────────────────────────────────

  if (!systemState && !loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Lade Systemstatus…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="card max-w-md w-full text-center space-y-4">
          <p className="text-red-400 text-sm">
            Systemstatus konnte nicht geladen werden: {loadError}
          </p>
          <button
            className="btn-secondary"
            onClick={() => window.location.reload()}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  // ─── Success state ───────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="card max-w-md w-full text-center space-y-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 mx-auto">
            <svg
              className="w-6 h-6 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-emerald-400">
            Lizenz aktiviert — System wird entsperrt…
          </h2>
          <p className="text-sm text-slate-400">
            Sie werden in wenigen Sekunden weitergeleitet.
          </p>
        </div>
      </div>
    );
  }

  // ─── Main activation screen ──────────────────────────────────────────────────

  const fp = systemState!.fingerprint;
  const installId = systemState!.installId;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-lg space-y-8">

        {/* Logo + heading */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 mx-auto">
            <svg
              className="w-9 h-9 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to VCP</h1>
          <p className="text-slate-400 text-sm">
            Um das Panel zu verwenden, muss eine gültige Lizenz aktiviert werden.
          </p>
        </div>

        {/* System info card */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Systemidentifikation
          </h2>

          {/* Install ID */}
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Install-ID</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-slate-800 px-3 py-2 text-xs font-mono text-slate-200 break-all select-all">
                {installId}
              </code>
              <button
                type="button"
                className="btn-secondary shrink-0 text-xs px-3 py-2"
                onClick={() => copyText(installId, 'installId')}
                title="In Zwischenablage kopieren"
              >
                {copiedInstallId ? 'Kopiert!' : 'Kopieren'}
              </button>
            </div>
          </div>

          {/* Hardware fingerprint */}
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Hardware-Fingerprint</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-slate-800 px-3 py-2 text-xs font-mono text-slate-200">
                {abbreviateFingerprint(fp)}
              </code>
              <button
                type="button"
                className="btn-secondary shrink-0 text-xs px-3 py-2"
                onClick={() => copyText(fp, 'fingerprint')}
                title="Vollständigen Fingerprint kopieren"
              >
                {copiedFingerprint ? 'Kopiert!' : 'Kopieren'}
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Wird zur Bindung der Lizenz an diese Hardware verwendet.
            </p>
          </div>
        </div>

        {/* Self-Hosted mode — no license server configured */}
        {!systemState!.apiConfigured && (
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              Self-Hosted-Modus
            </h2>
            <p className="text-sm text-slate-400">
              Es ist kein License-Server konfiguriert (<code className="text-xs">LICENSE_API_URL</code> /{' '}
              <code className="text-xs">LICENSE_PUBLIC_KEY</code> in der <code className="text-xs">.env</code> leer).
              Das Panel kann ohne Lizenz im Self-Hosted-Modus betrieben werden — ohne Limits und ohne
              externe Validierung.
            </p>
            {activateError && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2">
                <p className="text-sm text-red-400">{activateError}</p>
              </div>
            )}
            <button
              type="button"
              className="btn-primary w-full"
              onClick={handleSelfHosted}
              disabled={activating}
            >
              {activating ? 'Wird aktiviert…' : 'Im Self-Hosted-Modus fortfahren'}
            </button>
          </div>
        )}

        {/* Activation form */}
        {systemState!.apiConfigured && (
        <form onSubmit={handleActivate} className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Lizenzschlüssel eingeben
          </h2>

          <div className="space-y-1">
            <label className="text-xs text-slate-500" htmlFor="licenseKey">
              Lizenzschlüssel
            </label>
            <input
              id="licenseKey"
              className="input w-full font-mono"
              placeholder="VCP-XXXX-XXXX-XXXX-XXXX"
              value={licenseKey}
              onChange={(e) => {
                setLicenseKey(e.target.value);
                setActivateError(null);
              }}
              autoComplete="off"
              spellCheck={false}
              disabled={activating}
            />
          </div>

          {activateError && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2">
              <p className="text-sm text-red-400">{activateError}</p>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={licenseKey.trim().length < 8 || activating}
          >
            {activating ? 'Wird aktiviert…' : 'Aktivieren'}
          </button>
        </form>
        )}

        {/* Footer */}
        {systemState!.apiConfigured && (
          <p className="text-center text-xs text-slate-600">
            Die Lizenzvalidierung erfordert eine Verbindung zum konfigurierten License-Server.
          </p>
        )}
      </div>
    </div>
  );
}
