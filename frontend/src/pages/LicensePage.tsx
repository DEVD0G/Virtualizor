import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { LicenseState } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function LicensePage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');

  const { data: license } = useQuery({
    queryKey: ['license'],
    queryFn: () => api<LicenseState>('/license/status'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['license'] });

  const activate = useMutation({
    mutationFn: () => api('/license/activate', { method: 'POST', body: { licenseKey } }),
    onSuccess: () => { invalidate(); setLicenseKey(''); setError(''); },
    onError: (err: Error) => setError(err.message),
  });

  const refresh = useMutation({
    mutationFn: () => api('/license/refresh', { method: 'POST', body: {} }),
    onSettled: invalidate,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Lizenz</h1>
      <p className="text-sm" style={{ color: 'var(--tx-2)' }}>
        Die Lizenzverwaltung erfolgt über den externen License-Server — das Panel zeigt nur den Status an.
      </p>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Status</h2>
          {license && <StatusBadge status={license.status} />}
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt style={{ color: 'var(--tx-2)' }}>Tier</dt><dd>{license?.tier ?? '—'}</dd></div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--tx-2)' }}>Limits</dt>
            <dd>{license?.limits ? `${license.limits.maxNodes} Nodes · ${license.limits.maxVms} VMs` : '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--tx-2)' }}>Features</dt>
            <dd className="max-w-sm text-right">{license?.features.join(', ') || '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--tx-2)' }}>Gültig bis</dt>
            <dd>{license?.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: 'var(--tx-2)' }}>Zuletzt validiert</dt>
            <dd>{license?.lastValidatedAt ? new Date(license.lastValidatedAt).toLocaleString() : '—'}</dd>
          </div>
          {license?.graceRemainingDays != null && (
            <div className="flex justify-between">
              <dt style={{ color: 'var(--tx-2)' }}>Grace Period</dt>
              <dd className="text-amber-500">{license.graceRemainingDays} Tage verbleibend</dd>
            </div>
          )}
        </dl>
        {can('license.manage') && (
          <button className="btn-secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            Jetzt revalidieren
          </button>
        )}
      </div>

      {can('license.manage') && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Lizenz aktivieren</h2>
          <div className="flex gap-2">
            <input className="input max-w-md font-mono" placeholder="VCP-XXXX-XXXX-XXXX"
              value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} />
            <button className="btn-primary" disabled={licenseKey.length < 8 || activate.isPending}
              onClick={() => activate.mutate()}>
              Aktivieren
            </button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
