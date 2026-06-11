import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Container, Node, Vm } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface Item {
  id: string;
  label: string;
  sub: string;
  href: string;
  type: 'vm' | 'container' | 'node';
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const TYPE_ICON: Record<Item['type'], string> = { vm: 'VM', container: 'CT', node: 'Node' };
const TYPE_COLOR: Record<Item['type'], string> = {
  vm:        'bg-[var(--brand-sub)] text-[var(--brand)]',
  container: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  node:      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
};

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: vms } = useQuery({
    queryKey: ['vms'],
    queryFn: () => api<Vm[]>('/vms'),
    enabled: open && can('vm.read'),
    staleTime: 30_000,
  });
  const { data: containers } = useQuery({
    queryKey: ['containers'],
    queryFn: () => api<Container[]>('/containers'),
    enabled: open && can('vm.read'),
    staleTime: 30_000,
  });
  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<Node[]>('/nodes'),
    enabled: open && can('node.read'),
    staleTime: 30_000,
  });

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...(vms ?? []).map((v) => ({
        id: v.id, label: v.name,
        sub: `${v.state} · ${v.node.name}`,
        href: `/vms/${v.id}`, type: 'vm' as const,
      })),
      ...(containers ?? []).map((c) => ({
        id: c.id, label: c.name,
        sub: `${c.state} · ${c.node.name}`,
        href: `/containers/${c.id}`, type: 'container' as const,
      })),
      ...(nodes ?? []).map((n) => ({
        id: n.id, label: n.name,
        sub: `${n.state} · ${n.hostname}`,
        href: `/nodes/${n.id}`, type: 'node' as const,
      })),
    ];
    if (!query.trim()) return all.slice(0, 8);
    const q = query.toLowerCase();
    return all
      .filter((i) => i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, vms, containers, nodes]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => { setCursor(0); }, [query]);

  function select(item: Item) {
    navigate(item.href);
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      if (items[cursor]) select(items[cursor]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[8vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 py-3.5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            style={{ color: 'var(--tx-3)' }}>
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--tx-1)' }}
            placeholder="VMs, Container, Nodes suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <kbd
            className="hidden rounded px-1.5 py-0.5 text-xs sm:block"
            style={{ border: '1px solid var(--border)', color: 'var(--tx-3)' }}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        {items.length > 0 ? (
          <ul className="max-h-[28rem] overflow-y-auto py-1.5">
            {items.map((item, i) => (
              <li
                key={`${item.type}-${item.id}`}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors"
                style={{
                  background: i === cursor ? 'var(--surface-2)' : undefined,
                }}
                onClick={() => select(item)}
                onMouseEnter={() => setCursor(i)}
              >
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[item.type]}`}>
                  {TYPE_ICON[item.type]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" style={{ color: 'var(--tx-1)' }}>
                    {item.label}
                  </span>
                  <span className="block truncate text-xs" style={{ color: 'var(--tx-3)' }}>
                    {item.sub}
                  </span>
                </span>
                {i === cursor && (
                  <kbd className="shrink-0 text-xs" style={{ color: 'var(--tx-3)' }}>↵</kbd>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-10 text-center text-sm" style={{ color: 'var(--tx-3)' }}>
            Keine Ergebnisse für „{query}"
          </div>
        )}

        {/* Footer hints */}
        <div
          className="flex items-center gap-4 px-4 py-2 text-xs"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--tx-3)' }}
        >
          <span>
            <kbd className="mr-0.5 rounded border border-current px-1 py-px">↑</kbd>
            <kbd className="mr-1 rounded border border-current px-1 py-px">↓</kbd>
            Navigieren
          </span>
          <span>
            <kbd className="mr-1 rounded border border-current px-1 py-px">↵</kbd>
            Öffnen
          </span>
          <span className="ml-auto">
            <kbd className="mr-1 rounded border border-current px-1 py-px">⌘K</kbd>
            Palette
          </span>
        </div>
      </div>
    </div>
  );
}
