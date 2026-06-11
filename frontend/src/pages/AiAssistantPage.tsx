import { useRef, useState } from 'react';
import { api, apiStream } from '../api/client';
import { AiChatMessage, AiExecuteResult } from '../api/types';
import ActionPlanCard from '../components/ActionPlanCard';

const QUICK_PROMPTS = [
  { label: 'Cluster-Überblick', text: 'Gib mir einen vollständigen Überblick über den aktuellen Cluster-Status.' },
  { label: 'Neue VM erstellen', text: 'Hilf mir eine neue VM zu erstellen.' },
  { label: 'Ressourcen analysieren', text: 'Analysiere die Ressourcenauslastung und gib Optimierungsempfehlungen.' },
  { label: 'Netzwerk erklärt', text: 'Erkläre mir den Unterschied zwischen Bridge und NAT-Netzwerken einfach verständlich.' },
  { label: 'Backup-Strategie', text: 'Wie richte ich eine gute Backup-Strategie für meine VMs ein?' },
  { label: 'Snapshot vs Backup', text: 'Was ist der Unterschied zwischen einem Snapshot und einem Backup, und wann nutze ich was?' },
];

function Message({
  msg,
  onConfirm,
  onReject,
}: {
  msg: AiChatMessage;
  onConfirm: (planId: string) => void;
  onReject: (planId: string) => void;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${isUser ? '' : 'bg-brand-500 text-white'}`}
        style={isUser ? { background: 'var(--surface-2)', color: 'var(--tx-1)' } : undefined}
      >
        {isUser ? 'Du' : 'V'}
      </div>
      <div className={`max-w-2xl flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? 'bg-brand-500 text-white rounded-tr-sm' : 'rounded-tl-sm shadow-sm'}`}
          style={!isUser ? { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--tx-1)' } : undefined}
        >
          {msg.content.split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
          ))}
          {(msg as any).streaming && <span className="inline-block w-1.5 h-3.5 ml-1 bg-current animate-pulse rounded-sm" />}
        </div>
        {msg.actionPlan && msg.planId && (
          <ActionPlanCard
            plan={msg.actionPlan}
            planId={msg.planId}
            status={msg.planStatus ?? 'pending'}
            results={(msg as any).__results}
            onConfirm={onConfirm}
            onReject={onReject}
          />
        )}
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: AiChatMessage = { id: crypto.randomUUID(), role: 'user', content };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    scrollToBottom();

    const msgId = crypto.randomUUID();
    let accText = '';
    setMessages((prev) => [...prev, { id: msgId, role: 'assistant', content: '', streaming: true } as any]);

    try {
      await apiStream(
        '/ai/chat/stream',
        { messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) },
        (event) => {
          if (event.type === 'text') {
            accText += event.text;
            setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: accText, streaming: true } : m));
            scrollToBottom();
          } else if (event.type === 'plan') {
            setMessages((prev) => prev.map((m) =>
              m.id === msgId ? { ...m, actionPlan: event.plan, planId: event.planId, planStatus: 'pending' } : m,
            ));
          } else if (event.type === 'done') {
            setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, streaming: false } : m));
          } else if (event.type === 'error') {
            setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: `Fehler: ${event.message}`, streaming: false } : m));
          }
        },
      );
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: `Fehler: ${err.message}`, streaming: false } : m));
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  async function confirmPlan(planId: string) {
    setMessages((prev) => prev.map((m) => m.planId === planId ? { ...m, planStatus: 'executing' } : m));
    try {
      const results: AiExecuteResult[] = await api('/ai/execute', { method: 'POST', body: { planId } });
      setMessages((prev) => prev.map((m) => m.planId === planId ? { ...m, planStatus: 'done', __results: results } as any : m));
      const ok = results.every((r) => r.success);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: ok ? `✓ Alle ${results.length} Schritte erfolgreich ausgeführt.` : `${results.filter((r) => !r.success).length} Fehler bei der Ausführung.`,
      }]);
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => m.planId === planId ? { ...m, planStatus: 'done' } : m));
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Ausführung fehlgeschlagen: ${err.message}` }]);
    }
    scrollToBottom();
  }

  function rejectPlan(planId: string) {
    setMessages((prev) => prev.map((m) => m.planId === planId ? { ...m, planStatus: 'rejected' } : m));
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold">KI-Infrastruktur-Assistent</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--tx-2)' }}>
            Stelle Fragen, plane Änderungen und verwalte deine Infrastruktur in natürlicher Sprache
          </p>
        </div>
        {messages.length > 0 && (
          <button className="btn-secondary text-sm" onClick={() => setMessages([])}>Neues Gespräch</button>
        )}
      </div>

      {messages.length === 0 && (
        <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 flex-shrink-0">
          {QUICK_PROMPTS.map((p) => (
            <button key={p.label} onClick={() => send(p.text)}
              className="card text-left hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors cursor-pointer">
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--tx-3)' }}>{p.text}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-5 pr-1">
        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} onConfirm={confirmPlan} onReject={rejectPlan} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex gap-3 flex-shrink-0">
        <textarea
          className="input flex-1 resize-none"
          rows={2}
          placeholder="Frage stellen oder Infrastrukturänderung beschreiben… (Enter = Senden, Shift+Enter = Neue Zeile)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={loading}
        />
        <button className="btn-primary self-end px-5" onClick={() => send()} disabled={loading || !input.trim()}>
          Senden
        </button>
      </div>
    </div>
  );
}
