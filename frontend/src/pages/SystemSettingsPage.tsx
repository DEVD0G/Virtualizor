import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { Setting } from '../api/types';
import { useToast } from '../components/ToastProvider';

function toMap(settings: Setting[]): Record<string, string> {
  return Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

function useSettings() {
  return useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api<Setting[]>('/settings'),
  });
}

function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: { key: string; value: string }[]) =>
      api<Setting[]>('/settings', { method: 'PATCH', body: { settings } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-settings'] }),
  });
}

export default function SystemSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Systemeinstellungen</h1>
      <AllgemeinSection />
      <LizenzSection />
      <SmtpSection />
    </div>
  );
}

function AllgemeinSection() {
  const { data: settings, isLoading } = useSettings();
  const map = settings ? toMap(settings) : {};
  const [name, setName] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const { toast } = useToast();
  const save = useSaveSettings();

  const currentName = name ?? map['cluster.name'] ?? '';
  const currentTz = timezone ?? map['cluster.timezone'] ?? 'UTC';

  function handleSave() {
    save.mutate(
      [
        { key: 'cluster.name', value: currentName },
        { key: 'cluster.timezone', value: currentTz },
      ],
      {
        onSuccess: () => toast('success', 'Einstellungen gespeichert'),
        onError: (e: any) => toast('error', 'Fehler beim Speichern', e?.message),
      },
    );
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">Allgemein</h2>
      {isLoading && <p className="text-sm text-slate-400">Lade…</p>}
      <div className="space-y-3 max-w-sm">
        <div>
          <label className="label">Cluster-Name</label>
          <input
            className="input"
            placeholder="VCP Cluster"
            value={currentName}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Zeitzone</label>
          <select
            className="input"
            value={currentTz}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {[
              'UTC',
              'Europe/Berlin',
              'Europe/Vienna',
              'Europe/Zurich',
              'Europe/London',
              'America/New_York',
              'America/Los_Angeles',
              'Asia/Tokyo',
            ].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary"
          disabled={save.isPending}
          onClick={handleSave}
        >
          {save.isPending ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

function LizenzSection() {
  const { data: settings, isLoading } = useSettings();
  const map = settings ? toMap(settings) : {};
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const { toast } = useToast();
  const save = useSaveSettings();

  const currentEndpoint = endpoint ?? map['license.endpoint'] ?? '';
  const currentKey = key ?? map['license.key'] ?? '';

  function handleSave() {
    save.mutate(
      [
        { key: 'license.endpoint', value: currentEndpoint },
        { key: 'license.key', value: currentKey },
      ],
      {
        onSuccess: () => toast('success', 'Einstellungen gespeichert'),
        onError: (e: any) => toast('error', 'Fehler beim Speichern', e?.message),
      },
    );
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">Lizenz</h2>
      {isLoading && <p className="text-sm text-slate-400">Lade…</p>}
      <div className="space-y-3 max-w-sm">
        <div>
          <label className="label">Lizenz-Endpunkt</label>
          <input
            className="input"
            type="url"
            placeholder="https://license.example.com"
            value={currentEndpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Lizenzschlüssel</label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={currentKey}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <button
          className="btn-primary"
          disabled={save.isPending}
          onClick={handleSave}
        >
          {save.isPending ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

function SmtpSection() {
  const { data: settings, isLoading } = useSettings();
  const map = settings ? toMap(settings) : {};
  const [host, setHost] = useState<string | null>(null);
  const [port, setPort] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const { toast } = useToast();
  const save = useSaveSettings();

  const currentHost = host ?? map['smtp.host'] ?? '';
  const currentPort = port ?? map['smtp.port'] ?? '';
  const currentUser = user ?? map['smtp.user'] ?? '';
  const currentPassword = password ?? map['smtp.password'] ?? '';
  const currentFrom = from ?? map['smtp.from'] ?? '';

  function handleSave() {
    save.mutate(
      [
        { key: 'smtp.host', value: currentHost },
        { key: 'smtp.port', value: currentPort },
        { key: 'smtp.user', value: currentUser },
        { key: 'smtp.password', value: currentPassword },
        { key: 'smtp.from', value: currentFrom },
      ],
      {
        onSuccess: () => toast('success', 'Einstellungen gespeichert'),
        onError: (e: any) => toast('error', 'Fehler beim Speichern', e?.message),
      },
    );
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">SMTP <span className="text-xs font-normal text-slate-400">(für zukünftige Benachrichtigungen)</span></h2>
      {isLoading && <p className="text-sm text-slate-400">Lade…</p>}
      <div className="space-y-3 max-w-sm">
        <div>
          <label className="label">Host</label>
          <input
            className="input"
            placeholder="smtp.example.com"
            value={currentHost}
            onChange={(e) => setHost(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Port</label>
          <input
            className="input"
            type="number"
            placeholder="587"
            value={currentPort}
            onChange={(e) => setPort(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Benutzer</label>
          <input
            className="input"
            placeholder="notifications@example.com"
            value={currentUser}
            onChange={(e) => setUser(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Passwort</label>
          <input
            className="input"
            type="password"
            value={currentPassword}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Absender (From)</label>
          <input
            className="input"
            placeholder="VCP <noreply@example.com>"
            value={currentFrom}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <button
          className="btn-primary"
          disabled={save.isPending}
          onClick={handleSave}
        >
          {save.isPending ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}
