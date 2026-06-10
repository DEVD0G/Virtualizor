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

const riskColors = {
  low: 'border-emerald-400 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10',
  medium: 'border-amber-400 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
  high: 'border-red-400 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10',
};

const riskLabels = { low: 'Geringes Risiko', medium: 'Mittleres Risiko', high: 'Hohes Risiko' };
const riskTextColors = {
  low: 'text-emerald-700 dark:text-emerald-400',
  medium: 'text-amber-700 dark:text-amber-400',
  high: 'text-red-700 dark:text-red-400',
};

export default function ActionPlanCard({ plan, planId, status, results, onConfirm, onReject }: Props) {
  return (
    <div className={`my-3 rounded-xl border-2 p-4 ${riskColors[plan.riskLevel]}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">{plan.intent}</div>
          <div className={`text-xs font-medium mt-0.5 ${riskTextColors[plan.riskLevel]}`}>
            {riskLabels[plan.riskLevel]}
          </div>
        </div>
        {status === 'done' && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
            Ausgeführt
          </span>
        )}
        {status === 'rejected' && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            Abgebrochen
          </span>
        )}
        {status === 'executing' && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 animate-pulse">
            Wird ausgeführt…
          </span>
        )}
      </div>

      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{plan.explanation}</p>

      {plan.warnings && plan.warnings.length > 0 && (
        <div className="mb-3 rounded-lg bg-amber-100 px-3 py-2 dark:bg-amber-500/20">
          {plan.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800 dark:text-amber-300">⚠ {w}</p>
          ))}
        </div>
      )}

      <div className="mb-3 space-y-1.5">
        {plan.steps.map((step, i) => {
          const result = results?.find((r) => r.stepIndex === i);
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg bg-white/60 px-3 py-2 text-xs dark:bg-slate-900/40"
            >
              <span className="text-base leading-none">{categoryIcons[step.capability] ?? '⚡'}</span>
              <span className="flex-1 text-slate-700 dark:text-slate-300">{step.description}</span>
              {!step.reversible && (
                <span className="text-amber-600 dark:text-amber-400" title="Nicht rückgängig zu machen">⚠</span>
              )}
              {result && (
                <span className={result.success ? 'text-emerald-600' : 'text-red-600'}>
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
            <p key={i} className="text-xs text-red-600 dark:text-red-400">
              Schritt {r.stepIndex + 1} fehlgeschlagen: {r.error}
            </p>
          ))}
          {results.every((r) => r.success) && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Alle {results.length} Schritte erfolgreich ausgeführt.
            </p>
          )}
        </div>
      )}

      {status === 'pending' && (
        <div className="flex gap-2 mt-2">
          <button
            className="flex-1 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition-colors"
            onClick={() => onConfirm(planId)}
          >
            Ausführen bestätigen
          </button>
          <button
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            onClick={() => onReject(planId)}
          >
            Abbrechen
          </button>
        </div>
      )}
    </div>
  );
}
