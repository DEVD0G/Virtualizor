import { AiActionPlan, AiExecuteResult } from '../api/types';

interface Props {
  plan: AiActionPlan;
  planId: string;
  status: 'pending' | 'executing' | 'done' | 'rejected';
  results?: AiExecuteResult[];
  onConfirm: (planId: string) => void;
  onReject: (planId: string) => void;
}

const categoryIcons: Record<string, string> = {
  'vm.create': '⊕',
  'vm.start': '▶',
  'vm.stop': '◼',
  'vm.restart': '↺',
  'vm.delete': '⊗',
  'vm.snapshot.create': '📸',
  'vm.backup.create': '💾',
  'network.create': '🌐',
};

const riskBorder = {
  low:    '2px solid rgba(34,197,94,0.4)',
  medium: '2px solid rgba(245,158,11,0.4)',
  high:   '2px solid rgba(239,68,68,0.4)',
};
const riskBg = {
  low:    'rgba(34,197,94,0.06)',
  medium: 'rgba(245,158,11,0.06)',
  high:   'rgba(239,68,68,0.06)',
};
const riskColor = {
  low:    '#22c55e',
  medium: '#f59e0b',
  high:   '#ef4444',
};
const riskLabels = { low: 'Geringes Risiko', medium: 'Mittleres Risiko', high: 'Hohes Risiko' };

export default function ActionPlanCard({ plan, planId, status, results, onConfirm, onReject }: Props) {
  return (
    <div
      className="my-3 rounded-xl p-4"
      style={{ border: riskBorder[plan.riskLevel], background: riskBg[plan.riskLevel] }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--tx-1)' }}>{plan.intent}</div>
          <div className="mt-0.5 text-xs font-medium" style={{ color: riskColor[plan.riskLevel] }}>
            {riskLabels[plan.riskLevel]}
          </div>
        </div>
        {status === 'done' && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Ausgeführt
          </span>
        )}
        {status === 'rejected' && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: 'var(--surface-3)', color: 'var(--tx-2)' }}
          >
            Abgebrochen
          </span>
        )}
        {status === 'executing' && (
          <span className="animate-pulse rounded-full bg-[var(--brand-sub)] px-2 py-0.5 text-xs font-medium text-[var(--brand)]">
            Wird ausgeführt…
          </span>
        )}
      </div>

      <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--tx-2)' }}>{plan.explanation}</p>

      {plan.warnings && plan.warnings.length > 0 && (
        <div className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2">
          {plan.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {w}</p>
          ))}
        </div>
      )}

      <div className="mb-3 space-y-1.5">
        {plan.steps.map((step, i) => {
          const result = results?.find((r) => r.stepIndex === i);
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-2)' }}
            >
              <span className="text-base leading-none">{categoryIcons[step.capability] ?? '⚡'}</span>
              <span className="flex-1" style={{ color: 'var(--tx-1)' }}>{step.description}</span>
              {!step.reversible && (
                <span className="text-amber-500" title="Nicht rückgängig zu machen">⚠</span>
              )}
              {result && (
                <span className={result.success ? 'text-emerald-500' : 'text-red-500'}>
                  {result.success ? '✓' : '✗'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {status === 'done' && results && (
        <div className="mb-2 space-y-1">
          {results.filter((r) => !r.success).map((r, i) => (
            <p key={i} className="text-xs text-red-500">
              Schritt {r.stepIndex + 1} fehlgeschlagen: {r.error}
            </p>
          ))}
          {results.every((r) => r.success) && (
            <p className="text-xs text-emerald-500">
              Alle {results.length} Schritte erfolgreich ausgeführt.
            </p>
          )}
        </div>
      )}

      {status === 'pending' && (
        <div className="mt-2 flex gap-2">
          <button
            className="btn-primary flex-1 text-xs"
            onClick={() => onConfirm(planId)}
          >
            Ausführen bestätigen
          </button>
          <button
            className="btn-secondary text-xs"
            onClick={() => onReject(planId)}
          >
            Abbrechen
          </button>
        </div>
      )}
    </div>
  );
}
