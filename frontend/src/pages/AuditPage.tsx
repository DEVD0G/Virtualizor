import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { AuditLog } from '../api/types';
import StatusBadge from '../components/StatusBadge';

export default function AuditPage() {
  const { data: logs } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api<AuditLog[]>('/audit-logs?limit=200'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Audit-Log</h1>
      <div className="card overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr><th>Zeit</th><th>Benutzer</th><th>Aktion</th><th>Ergebnis</th><th>IP</th></tr>
          </thead>
          <tbody>
            {logs?.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                <td>{log.user?.email ?? 'system'}</td>
                <td className="font-mono text-xs">{log.action}</td>
                <td><StatusBadge status={log.outcome === 'success' ? 'active' : 'error'} /></td>
                <td className="font-mono text-xs">{log.sourceIp ?? '—'}</td>
              </tr>
            ))}
            {!logs?.length && <tr><td colSpan={5} className="text-center text-slate-400">Keine Einträge</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
