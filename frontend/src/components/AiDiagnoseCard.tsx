import { useState } from 'react';
import { api } from '../api/client';
import { DiagnosticsResult } from '../api/types';

interface Props {
  resourceType: 'vm' | 'node';
  resourceId: string;
}

const severityConfig = {
  info: { icon: 'ℹ', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/30' },
  warning: { icon: '⚠', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/30' },
  critical: { icon: '✕', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/30' },
};

const statusConfig = {
  ok: { label: 'Alles in Ordnung', icon: '✓', class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
  warning: { label: 'Warnung', icon: '⚠', class: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
  critical: { label: 'Kritisch', icon: '✕', class: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
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
        <h2 className="font-semibold">KI-Analyse</h2>
        <button
          className="btn-secondary text-sm flex items-center gap-1.5"
          onClick={runDiagnosis}
          disabled={loading}
        >
          <span>{loading ? '⟳' : '✦'}</span>
          {loading ? 'Analysiere…' : result ? 'Erneut analysieren' : 'Jetzt analysieren'}
        </button>
      </div>

      {!result && !loading && !error && (
        <p className="text-sm text-slate-400">
          Lass die KI diese Ressource auf Probleme, Risiken und Optimierungspotenziale analysieren.
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
          <span>KI analysiert…</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status!.class}`}>
              {status!.icon} {status!.label}
            </span>
            <p className="flex-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{result.summary}</p>
          </div>

          {result.issues.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Befunde</h3>
              {result.issues.map((issue, i) => {
                const cfg = severityConfig[issue.severity];
                return (
                  <div key={i} className={`rounded-lg border px-3 py-2.5 ${cfg.bg} ${cfg.border}`}>
                    <div className={`flex items-center gap-1.5 text-sm font-medium ${cfg.color}`}>
                      <span>{cfg.icon}</span>
                      <span>{issue.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{issue.description}</p>
                    {issue.suggestion && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500 italic">→ {issue.suggestion}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {result.recommendations.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Empfehlungen</h3>
              <ul className="space-y-1.5">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span className="text-brand-500 mt-0.5">→</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="text-xs text-brand-500 hover:text-brand-600 hover:underline"
            onClick={() => {
              const prompt = `Analysiere ${resourceType === 'vm' ? 'VM' : 'Node'} ${resourceId} und gib mir detaillierte Empfehlungen.`;
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
