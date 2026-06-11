import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Container } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import AiDiagnoseCard from '../components/AiDiagnoseCard';
import StatusBadge from '../components/StatusBadge';

export default function ContainerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showMeta, setShowMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ description: '', tags: '' });
  const [showResize, setShowResize] = useState(false);
  const [resizeForm, setResizeForm] = useState({ vcpus: '', memoryMb: '' });

  const { data: ct } = useQuery({
    queryKey: ['containers', id],
    queryFn: () => api<Container>(`/containers/${id}`),
    refetchInterval: 10_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['containers'] });

  const action = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method?: string; body?: unknown }) =>
      api(path, { method: method ?? 'POST', body: body ?? {} }),
    onSettled: invalidate,
  });

  if (!ct) return <div style={{ color: 'var(--tx-3)' }}>Lade…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{ct.name}</h1>
          <StatusBadge status={ct.state} />
          <span className="rounded px-2 py-0.5 text-xs font-mono" style={{ background: 'var(--surface-2)', color: 'var(--tx-2)' }}>
            {ct.osTemplate}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('vm.manage') && ct.state === 'stopped' && (
            <button className="btn-primary" disabled={action.isPending}
              onClick={() => action.mutate({ path: `/containers/${ct.id}/start` })}>
              Start
            </button>
          )}
          {can('vm.manage') && ct.state === 'running' && (
            <>
              <button className="btn-secondary" disabled={action.isPending}
                onClick={() => action.mutate({ path: `/containers/${ct.id}/restart` })}>
                Restart
              </button>
              <button className="btn-secondary" disabled={action.isPending}
                onClick={() => action.mutate({ path: `/containers/${ct.id}/stop` })}>
                Stop
              </button>
            </>
          )}
          {can('vm.delete') && (
            <button className="btn-danger"
              onClick={() => {
                if (confirm(`Container "${ct.name}" löschen?`)) {
                  action.mutate({ path: `/containers/${ct.id}`, method: 'DELETE' });
                  navigate('/containers');
                }
              }}>
              Löschen
            </button>
          )}
        </div>
      </div>

      {ct.errorMsg && (
        <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {ct.errorMsg}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Config card */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Konfiguration</h2>
            {can('vm.manage') && ct.state === 'stopped' && (
              <button className="btn-secondary text-xs" onClick={() => {
                setResizeForm({ vcpus: String(ct.vcpus), memoryMb: String(ct.memoryMb) });
                setShowResize(!showResize);
              }}>
                {showResize ? 'Abbrechen' : 'Resize'}
              </button>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt style={{ color: 'var(--tx-2)' }}>vCPUs</dt><dd>{ct.vcpus}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--tx-2)' }}>RAM</dt><dd>{(ct.memoryMb / 1024).toFixed(1)} GiB</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--tx-2)' }}>Disk</dt><dd>{ct.diskGb} GB</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--tx-2)' }}>IP-Adresse</dt>
              <dd className="font-mono text-xs">{ct.ipAddress ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--tx-2)' }}>Node</dt><dd>{ct.node.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--tx-2)' }}>Besitzer</dt>
              <dd>{ct.owner.name} ({ct.owner.email})</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--tx-2)' }}>Erstellt</dt>
              <dd>{new Date(ct.createdAt).toLocaleString()}</dd>
            </div>
          </dl>

          {showResize && (
            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">vCPUs</label>
                  <input className="input" type="number" min="1" max="128" value={resizeForm.vcpus}
                    onChange={(e) => setResizeForm({ ...resizeForm, vcpus: e.target.value })} />
                </div>
                <div>
                  <label className="label">RAM (MiB)</label>
                  <input className="input" type="number" min="128" step="128" value={resizeForm.memoryMb}
                    onChange={(e) => setResizeForm({ ...resizeForm, memoryMb: e.target.value })} />
                </div>
              </div>
              <button className="btn-primary w-full" onClick={() => {
                action.mutate({
                  path: `/containers/${ct.id}`,
                  method: 'PATCH',
                  body: { vcpus: parseInt(resizeForm.vcpus), memoryMb: parseInt(resizeForm.memoryMb) },
                });
                setShowResize(false);
              }}>
                Resize anwenden
              </button>
            </div>
          )}

          {/* Tags & Description */}
          {(ct.description || ct.tags.length > 0) && !showMeta && (
            <div className="mt-4 border-t pt-4 space-y-2 text-sm" style={{ borderColor: 'var(--border)' }}>
              {ct.description && (
                <p className="italic" style={{ color: 'var(--tx-1)' }}>{ct.description}</p>
              )}
              {ct.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ct.tags.map((t) => (
                    <span key={t} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--brand-sub)', color: 'var(--brand)' }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {can('vm.manage') && !showMeta && (
            <button
              className="mt-3 text-xs" style={{ color: 'var(--tx-3)' }}
              onClick={() => {
                setMetaForm({ description: ct.description ?? '', tags: ct.tags.join(', ') });
                setShowMeta(true);
              }}>
              Beschreibung & Tags bearbeiten
            </button>
          )}
          {showMeta && (
            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <label className="label">Beschreibung</label>
                <input className="input" value={metaForm.description}
                  onChange={(e) => setMetaForm({ ...metaForm, description: e.target.value })} />
              </div>
              <div>
                <label className="label">Tags (kommagetrennt)</label>
                <input className="input" placeholder="web, prod" value={metaForm.tags}
                  onChange={(e) => setMetaForm({ ...metaForm, tags: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={() => {
                  const tags = metaForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
                  action.mutate({
                    path: `/containers/${ct.id}`,
                    method: 'PATCH',
                    body: { description: metaForm.description || null, tags },
                  });
                  setShowMeta(false);
                }}>
                  Speichern
                </button>
                <button className="btn-secondary" onClick={() => setShowMeta(false)}>Abbrechen</button>
              </div>
            </div>
          )}
        </div>

        <AiDiagnoseCard resourceType="container" resourceId={ct.id} />
      </div>
    </div>
  );
}
