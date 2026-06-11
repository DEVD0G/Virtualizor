import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { AuditLog } from '../api/types';

const OUTCOMES = ['', 'success', 'failure'] as const;
const RESOURCE_TYPES = ['', 'vm', 'container', 'node', 'network', 'storage', 'user', 'auth', 'license'];
const PAGE_SIZE = 50;

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [page, setPage] = useState(0);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    ...(search ? { search } : {}),
    ...(outcome ? { outcome } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(since ? { since: new Date(since).toISOString() } : {}),
    ...(until ? { until: new Date(until + 'T23:59:59').toISOString() } : {}),
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit', search, outcome, resourceType, since, until, page],
    queryFn: () => api<AuditLog[]>(`/audit-logs?${params}`),
    placeholderData: (prev) => prev,
  });

  function reset() {
    setSearch(''); setOutcome(''); setResourceType('');
    setSince(''); setUntil(''); setPage(0);
  }

  const hasFilter = search || outcome || resourceType || since || until;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit-Log</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="label text-xs">Suche</label>
          <input
            className="input w-52"
            placeholder="Aktion, IP, E-Mail…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <div>
          <label className="label text-xs">Ergebnis</label>
          <select className="input w-32" value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(0); }}>
            <option value="">Alle</option>
            <option value="success">Erfolg</option>
            <option value="failure">Fehler</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Ressourcentyp</label>
          <select className="input w-36" value={resourceType} onChange={(e) => { setResourceType(e.target.value); setPage(0); }}>
            {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t || 'Alle'}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Von</label>
          <input type="date" className="input w-36" value={since} onChange={(e) => { setSince(e.target.value); setPage(0); }} />
        </div>
        <div>
          <label className="label text-xs">Bis</label>
          <input type="date" className="input w-36" value={until} onChange={(e) => { setUntil(e.target.value); setPage(0); }} />
        </div>
        {hasFilter && (
          <button className="btn-secondary self-end" onClick={reset}>Zurücksetzen</button>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Benutzer</th>
              <th>Aktion</th>
              <th>Ressource</th>
              <th>Ergebnis</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="text-center" style={{ color: 'var(--tx-3)' }}>Lade…</td></tr>
            )}
            {logs?.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="text-xs">{log.user?.email ?? <span style={{ color: 'var(--tx-3)' }}>system</span>}</td>
                <td className="font-mono text-xs">{log.action}</td>
                <td className="text-xs" style={{ color: 'var(--tx-2)' }}>
                  {log.resourceType}{log.resourceId ? `/${log.resourceId.slice(0, 8)}` : ''}
                </td>
                <td>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    log.outcome === 'success'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-red-500/15 text-red-600 dark:text-red-400'
                  }`}>
                    {log.outcome === 'success' ? 'OK' : 'Fehler'}
                  </span>
                </td>
                <td className="font-mono text-xs">{log.sourceIp ?? '—'}</td>
              </tr>
            ))}
            {!isLoading && !logs?.length && (
              <tr><td colSpan={6} className="text-center" style={{ color: 'var(--tx-3)' }}>Keine Einträge</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-3 text-sm">
        <button
          className="btn-secondary"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          ← Zurück
        </button>
        <span style={{ color: 'var(--tx-2)' }}>Seite {page + 1}</span>
        <button
          className="btn-secondary"
          disabled={!logs || logs.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Weiter →
        </button>
      </div>
    </div>
  );
}
