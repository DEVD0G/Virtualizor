import { useState } from 'react';
import { api } from '../api/client';
import { DiagnosticsResult } from '../api/types';

interface Props {
  resourceType: 'vm' | 'node' | 'container';
  resourceId: string;
}

const severityConfig = {
  info: {
    icon: 'ℹ',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.3)',
  },
  warning: {
    icon: '⚠',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.3)',
  },
  critical: {
    icon: '✕',
    color: 'text-red-600 dark:text-red-400',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.3)',
  },
};

const statusConfig = {
  ok:       { label: 'Alles in Ordnung', icon: '✓', classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  warning:  { label: 'Warnung',          icon: '⚠', classes: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  critical: { label: 'Kritisch',         icon: '✕', classes: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};

export default function AiDiagnoseCard({ resourceType, resourceId }: Props) {
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnosis() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api<DiagnosticsResult>('/ai/diagnose', {
        method: 'POST',
        body: { resourceType, resourceId },
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message ?? 'KI-Analyse fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const status = result ? statusConfig[result.overallStatus] : null;

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold" style={{ color: 'var(--tx-1)' }}>KI-Analyse</h2>
        <button
          className="btn-secondary flex items-center gap-1.5 text-sm"
          onClick={runDiagnosis}
          disabled={loading}
        >
          <span>{loading ? '⟳' : '✦'}</span>
          {loading ? 'Analysiere…' : result ? 'Erneut analysieren' : 'Jetzt analysieren'}
        </button>
      </div>

      {!result && !loading && !error && (
        <p className="text-sm" style={{ color: 'var(--tx-3)' }}>
          Lass die KI diese Ressource auf Probleme, Risiken und Optimierungspotenziale analysieren.
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--tx-2)' }}>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full"
                style={{ background: 'var(--brand)', animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
          <span>KI analysiert…</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status!.classes}`}>
              {status!.icon} {status!.label}
            </span>
            <p className="flex-1 text-sm leading-relaxed" style={{ color: 'var(--tx-1)' }}>
              {result.summary}
            </p>
          </div>

          {result.issues.length > 0 && (
            <div className="space-y-2">
              <h3 className="section-title">Befunde</h3>
              {result.issues.map((issue, i) => {
                const cfg = severityConfig[issue.severity];
                return (
                  <div
                    key={i}
                    className="rounded-lg px-3 py-2.5"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                  >
                    <div className={`flex items-center gap-1.5 text-sm font-medium ${cfg.color}`}>
                      <span>{cfg.icon}</span>
                      <span>{issue.title}</span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--tx-2)' }}>{issue.description}</p>
                    {issue.suggestion && (
                      <p className="mt-1 text-xs italic" style={{ color: 'var(--tx-3)' }}>
                        → {issue.suggestion}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {result.recommendations.length > 0 && (
            <div>
              <h3 className="section-title mb-2">Empfehlungen</h3>
              <ul className="space-y-1.5">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--tx-2)' }}>
                    <span className="mt-0.5" style={{ color: 'var(--brand)' }}>→</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="text-xs hover:underline"
            style={{ color: 'var(--brand)' }}
            onClick={() => {
              const label = resourceType === 'vm' ? 'VM' : resourceType === 'container' ? 'Container' : 'Node';
              const prompt = `Analysiere ${label} ${resourceId} und gib mir detaillierte Empfehlungen.`;
              window.dispatchEvent(new CustomEvent('vcp:ai:open', { detail: { prompt } }));
            }}
          >
            Im KI-Assistenten vertiefen →
          </button>
        </div>
      )}
    </div>
  );
}
