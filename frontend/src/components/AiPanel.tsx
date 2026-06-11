import { useEffect, useRef, useState } from 'react';
import { apiStream, api } from '../api/client';
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
      <div className="max-w-[85%]">
        {!isUser && (
          <div className="mb-1 flex items-center gap-1.5">
            <div
              className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: 'var(--brand)' }}
            >
              V
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--tx-2)' }}>VCP Assistant</span>
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser ? 'rounded-tr-sm text-white' : 'rounded-tl-sm shadow-sm'
          }`}
          style={
            isUser
              ? { background: 'var(--brand)' }
              : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--tx-1)' }
          }
        >
          {msg.content.split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
          ))}
          {msg.streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-current" />
          )}
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

const SUGGESTIONS = [
  'Welche VMs laufen gerade?',
  'Erkläre mir was ein Snapshot ist',
  'Was ist der Unterschied zwischen Bridge und NAT?',
  'Wie viel freier Speicher ist verfügbar?',
];

export default function AiPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setOpen(true);
      if (detail?.prompt) setInput(detail.prompt);
    };
    window.addEventListener('vcp:ai:open', handler);
    return () => window.removeEventListener('vcp:ai:open', handler);
  }, []);

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
    const assistantMsg: AiChatMessage = { id: msgId, role: 'assistant', content: '', streaming: true } as any;
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      await apiStream(
        '/ai/chat/stream',
        { messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) },
        (event) => {
          if (event.type === 'text') {
            accText += event.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, content: accText, streaming: true } : m)),
            );
            scrollToBottom();
          } else if (event.type === 'plan') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? { ...m, actionPlan: event.plan, planId: event.planId, planStatus: 'pending' }
                  : m,
              ),
            );
          } else if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, streaming: false } : m)),
            );
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: `Fehler: ${event.message}`, streaming: false } : m,
              ),
            );
          }
        },
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: `Fehler: ${err.message}`, streaming: false } : m,
        ),
      );
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  async function confirmPlan(planId: string) {
    setMessages((prev) => prev.map((m) => (m.planId === planId ? { ...m, planStatus: 'executing' } : m)));
    try {
      const results: AiExecuteResult[] = await api('/ai/execute', { method: 'POST', body: { planId } });
      setMessages((prev) =>
        prev.map((m) => (m.planId === planId ? { ...m, planStatus: 'done', __results: results } as any : m)),
      );
      const ok = results.every((r) => r.success);
      addAssistantNote(
        ok
          ? `Plan ausgeführt (${results.length} Schritt${results.length !== 1 ? 'e' : ''}).`
          : `${results.filter((r) => !r.success).length} Fehler bei der Ausführung.`,
      );
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => (m.planId === planId ? { ...m, planStatus: 'done' } : m)));
      addAssistantNote(`Fehler: ${err.message}`);
    }
    scrollToBottom();
  }

  function rejectPlan(planId: string) {
    setMessages((prev) => prev.map((m) => (m.planId === planId ? { ...m, planStatus: 'rejected' } : m)));
  }

  function addAssistantNote(content: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content }]);
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 flex h-13 w-13 items-center justify-center rounded-full shadow-lg transition-all focus:outline-none hover:scale-105 active:scale-95"
        style={{ background: 'var(--brand)', width: '52px', height: '52px' }}
        title="KI-Assistent"
      >
        <span className="select-none text-xl text-white">{open ? '×' : '✦'}</span>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-40 flex w-[380px] max-h-[70vh] flex-col rounded-2xl shadow-xl"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 rounded-t-2xl px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: 'var(--brand)' }}
            >
              V
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--tx-1)' }}>VCP Assistant</div>
              <div className="text-xs" style={{ color: 'var(--tx-3)' }}>KI-gestützte Infrastrukturverwaltung</div>
            </div>
            {messages.length > 0 && (
              <button
                className="ml-auto text-xs hover:underline"
                style={{ color: 'var(--tx-3)' }}
                onClick={() => setMessages([])}
              >
                Leeren
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: '200px' }}>
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-center text-xs" style={{ color: 'var(--tx-3)' }}>
                  Stelle Fragen oder lass mich Infrastrukturänderungen planen.
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full rounded-xl px-3 py-2 text-left text-xs transition-colors"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--tx-2)',
                      }}
                      onMouseOver={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)';
                        (e.currentTarget as HTMLElement).style.background = 'var(--brand-sub)';
                      }}
                      onMouseOut={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                        (e.currentTarget as HTMLElement).style.background = 'var(--surface)';
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} onConfirm={confirmPlan} onReject={rejectPlan} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="rounded-b-2xl p-3"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Frage stellen oder Aktion beschreiben…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                disabled={loading}
              />
              <button
                className="rounded-xl px-3 py-2 text-white transition-opacity disabled:opacity-40"
                style={{ background: 'var(--brand)' }}
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
