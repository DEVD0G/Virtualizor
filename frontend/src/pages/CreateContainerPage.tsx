import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Node } from '../api/types';

const OS_TEMPLATES = [
  { id: 'debian-12',      label: 'Debian 12 (Bookworm)' },
  { id: 'ubuntu-22.04',   label: 'Ubuntu 22.04 LTS' },
  { id: 'ubuntu-24.04',   label: 'Ubuntu 24.04 LTS' },
  { id: 'alpine-3.19',    label: 'Alpine Linux 3.19' },
  { id: 'rockylinux-9',   label: 'Rocky Linux 9' },
  { id: 'fedora-39',      label: 'Fedora 39' },
  { id: 'archlinux',      label: 'Arch Linux' },
  { id: 'opensuse-15.5',  label: 'openSUSE Leap 15.5' },
];

export default function CreateContainerPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [vcpus, setVcpus] = useState(1);
  const [memoryMb, setMemoryMb] = useState(512);
  const [diskGb, setDiskGb] = useState(10);
  const [osTemplate, setOsTemplate] = useState('debian-12');
  const [nodeId, setNodeId] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const { data: nodes } = useQuery({ queryKey: ['nodes'], queryFn: () => api<Node[]>('/nodes') });

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  }

  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, any> = { name, vcpus, memoryMb, diskGb, osTemplate, tags };
      if (nodeId) body.nodeId = nodeId;
      if (ipAddress) body.ipAddress = ipAddress;
      if (description) body.description = description;
      return api<{ container: { id: string } }>('/containers', { method: 'POST', body });
    },
    onSuccess: (data) => navigate(`/containers/${data.container.id}`),
    onError: (err: Error) => setError(err.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[a-z0-9][-a-z0-9]{2,62}$/.test(name)) {
      setError('Name: 3–63 Zeichen, nur a-z, 0-9 und Bindestrich');
      return;
    }
    create.mutate();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Neuen Container erstellen</h1>
      <form onSubmit={submit} className="space-y-5">

        {/* ─ Allgemein ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Allgemein</h2>
          <div>
            <label className="label">Name</label>
            <input className="input" value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-z0-9-]/g, ''))}
              placeholder="mein-container" required />
            <p className="mt-1 text-xs text-slate-400">3–63 Zeichen: a-z, 0-9, Bindestrich</p>
          </div>
          <div>
            <label className="label">Beschreibung (optional)</label>
            <input className="input" placeholder="Kurze Beschreibung" value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                  {t}
                  <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} className="text-brand-400 hover:text-brand-600 leading-none">×</button>
                </span>
              ))}
            </div>
            <input className="input w-48" placeholder="Tag eingeben + Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
              }}
              onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
            />
          </div>
        </div>

        {/* ─ Betriebssystem ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Betriebssystem</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {OS_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setOsTemplate(t.id)}
                className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                  osTemplate === t.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                }`}
              >
                <div className="font-medium">{t.label.split(' ')[0]}</div>
                <div className="text-slate-400 text-[10px] mt-0.5">{t.label.split(' ').slice(1).join(' ')}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ─ Hardware ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Hardware</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">vCPUs</label>
              <input className="input" type="number" min={1} max={128} value={vcpus}
                onChange={(e) => setVcpus(+e.target.value)} />
            </div>
            <div>
              <label className="label">RAM (MiB)</label>
              <input className="input" type="number" min={128} step={128} value={memoryMb}
                onChange={(e) => setMemoryMb(+e.target.value)} />
              <p className="mt-0.5 text-xs text-slate-400">{memoryMb >= 1024 ? `${(memoryMb / 1024).toFixed(1)} GiB` : `${memoryMb} MiB`}</p>
            </div>
            <div>
              <label className="label">Disk (GB)</label>
              <input className="input" type="number" min={5} max={4096} value={diskGb}
                onChange={(e) => setDiskGb(+e.target.value)} />
            </div>
          </div>
        </div>

        {/* ─ Netzwerk & Node ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Netzwerk & Node</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Node</label>
              <select className="input" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
                <option value="">Automatisch</option>
                {nodes?.filter((n) => n.state === 'online').map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">IP-Adresse (optional)</label>
              <input className="input" placeholder="192.168.1.100" value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)} />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate('/containers')}>Abbrechen</button>
          <button className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Erstelle…' : 'Container erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}
