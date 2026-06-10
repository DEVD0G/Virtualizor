import { useRef, useState } from 'react';
import { api } from '../api/client';
import { AiChatMessage, AiExecuteResult } from '../api/types';
import ActionPlanCard from './ActionPlanCard';

function MessageBubble({
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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && (
          <div className="mb-1 flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-xs text-white font-bold">V</div>
            <span className="text-xs font-medium text-slate-500">VCP Assistant</span>
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'bg-brand-500 text-white rounded-tr-sm'
              : 'bg-white text-slate-800 shadow-sm border border-slate-100 rounded-tl-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
          }`}
        >
          {msg.content.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              {i < msg.content.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>
        {msg.actionPlan && msg.planId && (
          <ActionPlanCard
            plan={msg.actionPlan}
            planId={msg.planId}
            status={msg.planStatus ?? 'pending'}
            results={msg.planStatus === 'done' ? (msg as any).__results : undefined}
            onConfirm={onConfirm}
            onReject={onReject}
          />
        )}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Welche VMs laufen gerade?',
  'Erkläre mir was ein Snapshot ist',
  'Was ist der Unterschied zwischen Bridge und NAT?',
  'Wie viel Speicher ist verfügbar?',
];

export default function AiPanel() {
  const [open, setOpen] = useState(false);
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

    try {
      const history = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const resp = await api<{ message: string; actionPlan?: any; planId?: string }>('/ai/chat', {
        method: 'POST',
        body: { messages: history },
      });

      const assistantMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: resp.message,
        actionPlan: resp.actionPlan,
        planId: resp.planId,
        planStatus: resp.actionPlan ? 'pending' : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      scrollToBottom();
    } catch (err: any) {
      const errMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Fehler: ${err.message ?? 'Verbindung zum AI-Assistenten fehlgeschlagen.'}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmPlan(planId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.planId === planId ? { ...m, planStatus: 'executing' } : m)),
    );

    try {
      const results: AiExecuteResult[] = await api('/ai/execute', {
        method: 'POST',
        body: { planId },
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.planId === planId ? { ...m, planStatus: 'done', __results: results } as any : m,
        ),
      );

      const allOk = results.every((r) => r.success);
      const summary: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: allOk
          ? `Plan erfolgreich ausgeführt. ${results.length} Schritt${results.length !== 1 ? 'e' : ''} abgeschlossen.`
          : `Ausführung teilweise fehlgeschlagen. ${results.filter((r) => !r.success).length} von ${results.length} Schritten fehlgeschlagen.`,
      };
      setMessages((prev) => [...prev, summary]);
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) => (m.planId === planId ? { ...m, planStatus: 'done' } : m)),
      );
      const errMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Ausführung fehlgeschlagen: ${err.message}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    }
    scrollToBottom();
  }

  function rejectPlan(planId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.planId === planId ? { ...m, planStatus: 'rejected' } : m)),
    );
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-brand-500 shadow-lg hover:bg-brand-600 transition-all focus:outline-none"
        title="KI-Assistent"
        style={{ width: '52px', height: '52px' }}
      >
        <span className="text-white text-xl">{open ? '×' : '✦'}</span>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-40 flex w-[380px] max-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center gap-2 rounded-t-2xl border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">V</div>
            <div>
              <div className="text-sm font-semibold">VCP Assistant</div>
              <div className="text-xs text-slate-400">KI-gestützte Infrastrukturverwaltung</div>
            </div>
            {messages.length > 0 && (
              <button
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                onClick={() => setMessages([])}
              >
                Leeren
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ minHeight: '200px' }}>
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 text-center">
                  Stelle mir Fragen zu deiner Infrastruktur oder lass mich Änderungen planen.
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:border-brand-300 hover:bg-brand-50 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onConfirm={confirmPlan}
                onReject={rejectPlan}
              />
            ))}
            {loading && (
              <div className="flex justify-start mb-3">
                <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-100 px-4 py-3 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 bg-white p-3 rounded-b-2xl dark:border-slate-700 dark:bg-slate-800">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                placeholder="Frage stellen oder Aktion beschreiben…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                disabled={loading}
              />
              <button
                className="rounded-xl bg-brand-500 px-3 py-2 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
                onClick={() => send()}
                disabled={loading || !input.trim()}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
