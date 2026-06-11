import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Network, Node, NodeDetail, Template } from '../api/types';

interface DiskEntry { sizeGb: number; storagePoolId: string }
interface NicEntry { networkId: string; ipPoolId: string }

export default function CreateVmPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [vcpus, setVcpus] = useState(2);
  const [memoryGb, setMemoryGb] = useState(4);
  const [nodeId, setNodeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [disks, setDisks] = useState<DiskEntry[]>([{ sizeGb: 40, storagePoolId: '' }]);
  const [nics, setNics] = useState<NicEntry[]>([{ networkId: '', ipPoolId: '' }]);
  const [sshKey, setSshKey] = useState('');
  const [userData, setUserData] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const { data: nodes } = useQuery({ queryKey: ['nodes'], queryFn: () => api<Node[]>('/nodes') });
  const { data: networks } = useQuery({ queryKey: ['networks'], queryFn: () => api<Network[]>('/networks') });
  const { data: templates } = useQuery({ queryKey: ['storage', 'templates'], queryFn: () => api<Template[]>('/storage/templates') });
  const { data: nodeDetail } = useQuery({
    queryKey: ['nodes', nodeId],
    queryFn: () => api<NodeDetail>(`/nodes/${nodeId}`),
    enabled: !!nodeId,
    staleTime: 60_000,
  });

  const storagePools = nodeDetail?.storagePools ?? [];

  useEffect(() => {
    if (templates?.length && !templateId) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  // Pre-fill first disk size from template's minDiskGb
  useEffect(() => {
    if (templateId && templates) {
      const t = templates.find((t) => t.id === templateId);
      if (t && disks[0].sizeGb < t.minDiskGb) {
        setDisks((prev) => [{ ...prev[0], sizeGb: t.minDiskGb }, ...prev.slice(1)]);
      }
    }
  }, [templateId, templates]);

  function addDisk() {
    setDisks((prev) => [...prev, { sizeGb: 20, storagePoolId: '' }]);
  }
  function removeDisk(i: number) {
    setDisks((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateDisk(i: number, patch: Partial<DiskEntry>) {
    setDisks((prev) => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  }

  function addNic() {
    setNics((prev) => [...prev, { networkId: '', ipPoolId: '' }]);
  }
  function removeNic(i: number) {
    setNics((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateNic(i: number, patch: Partial<NicEntry>) {
    setNics((prev) => prev.map((n, idx) => idx === i ? { ...n, ...patch } : n));
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  }

  const create = useMutation({
    mutationFn: () =>
      api<{ vm: { id: string } }>('/vms', {
        method: 'POST',
        body: {
          name,
          vcpus,
          memoryMb: memoryGb * 1024,
          disks: disks.map((d) => ({ sizeGb: d.sizeGb, ...(d.storagePoolId ? { storagePoolId: d.storagePoolId } : {}) })),
          nics: nics.map((n) => ({ networkId: n.networkId, ...(n.ipPoolId ? { ipPoolId: n.ipPoolId } : {}) })),
          ...(templateId ? { templateId } : {}),
          ...(nodeId ? { nodeId } : {}),
          cloudInit: (sshKey || userData)
            ? { ...(sshKey ? { sshKeys: [sshKey.trim()] } : {}), ...(userData ? { userData } : {}) }
            : undefined,
          tags,
          ...(description ? { description } : {}),
        },
      }),
    onSuccess: (data) => navigate(`/vms/${data.vm.id}`),
    onError: (err: Error) => setError(err.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!nics[0]?.networkId) { setError('Bitte mindestens ein Netzwerk wählen.'); return; }
    create.mutate();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Neue VM erstellen</h1>
      <form onSubmit={submit} className="space-y-5">

        {/* ─ Name ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Allgemein</h2>
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
              pattern="[a-z0-9][-a-z0-9]{2,62}" placeholder="web-01" required />
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

        {/* ─ Hardware ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Hardware</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">vCPUs</label>
              <input className="input" type="number" min={1} max={128} value={vcpus}
                onChange={(e) => setVcpus(+e.target.value)} />
            </div>
            <div>
              <label className="label">RAM (GiB)</label>
              <input className="input" type="number" min={0.25} max={1024} step={0.25} value={memoryGb}
                onChange={(e) => setMemoryGb(+e.target.value)} />
            </div>
          </div>

          {/* Disks */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">Disks</label>
              {disks.length < 8 && (
                <button type="button" className="btn-secondary text-xs" onClick={addDisk}>+ Disk</button>
              )}
            </div>
            <div className="space-y-2">
              {disks.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                  <div>
                    {i === 0 && <label className="label text-xs">Größe (GB)</label>}
                    <input className="input" type="number" min={1} max={16384} value={d.sizeGb}
                      onChange={(e) => updateDisk(i, { sizeGb: +e.target.value })} />
                  </div>
                  <div>
                    {i === 0 && <label className="label text-xs">Storage Pool{nodeId ? '' : ' (nach Node-Wahl)'}</label>}
                    <select className="input" value={d.storagePoolId}
                      onChange={(e) => updateDisk(i, { storagePoolId: e.target.value })}
                      disabled={!nodeId || storagePools.length === 0}>
                      <option value="">{storagePools.length === 0 ? 'Standard Pool' : 'Standard Pool'}</option>
                      {storagePools.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.type}, {p.totalGb > 0 ? `${p.totalGb - p.usedGb} GB frei` : 'Größe unbekannt'})</option>
                      ))}
                    </select>
                  </div>
                  <div className={i === 0 ? 'pt-5' : ''}>
                    {disks.length > 1 && (
                      <button type="button" className="btn-danger text-xs" onClick={() => removeDisk(i)}>×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─ Betriebssystem ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Betriebssystem</h2>
          <div>
            <label className="label">OS-Template</label>
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— kein Template (ISO-Boot) —</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.osType} · min. {t.minDiskGb} GB
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ─ Infrastruktur ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Infrastruktur</h2>
          <div>
            <label className="label">Node</label>
            <select className="input" value={nodeId} onChange={(e) => { setNodeId(e.target.value); setDisks((prev) => prev.map((d) => ({ ...d, storagePoolId: '' }))); }}>
              <option value="">Automatisch (Scheduler)</option>
              {nodes?.filter((n) => n.state === 'online').map((n) => (
                <option key={n.id} value={n.id}>{n.name} ({n.cpuCores} Cores, {(n.memoryMb / 1024).toFixed(0)} GiB)</option>
              ))}
            </select>
          </div>

          {/* NICs */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">Netzwerk-Interfaces</label>
              {nics.length < 8 && (
                <button type="button" className="btn-secondary text-xs" onClick={addNic}>+ NIC</button>
              )}
            </div>
            <div className="space-y-2">
              {nics.map((nic, i) => {
                const net = networks?.find((n) => n.id === nic.networkId);
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div>
                      {i === 0 && <label className="label text-xs">Netzwerk</label>}
                      <select className="input" value={nic.networkId} required={i === 0}
                        onChange={(e) => updateNic(i, { networkId: e.target.value, ipPoolId: '' })}>
                        <option value="">— wählen —</option>
                        {networks?.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.mode})</option>)}
                      </select>
                    </div>
                    <div>
                      {i === 0 && <label className="label text-xs">IP-Pool</label>}
                      <select className="input" value={nic.ipPoolId}
                        onChange={(e) => updateNic(i, { ipPoolId: e.target.value })}
                        disabled={!net || net.ipPools.length === 0}>
                        <option value="">Keine IP zuweisen</option>
                        {net?.ipPools.map((p) => <option key={p.id} value={p.id}>{p.cidr}</option>)}
                      </select>
                    </div>
                    <div className={i === 0 ? 'pt-5' : ''}>
                      {nics.length > 1 && (
                        <button type="button" className="btn-danger text-xs" onClick={() => removeNic(i)}>×</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─ Cloud-Init ─ */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wide">Cloud-Init (optional)</h2>
          <div>
            <label className="label">SSH Public Key</label>
            <textarea className="input font-mono text-xs" rows={2} value={sshKey}
              onChange={(e) => setSshKey(e.target.value)} placeholder="ssh-ed25519 AAAA…" />
          </div>
          <div>
            <label className="label">User-Data Script</label>
            <textarea className="input font-mono text-xs" rows={4} value={userData}
              onChange={(e) => setUserData(e.target.value)}
              placeholder={'#cloud-config\npackages:\n  - nginx'} />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate('/vms')}>Abbrechen</button>
          <button className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Erstelle…' : 'VM erstellen'}
          </button>
        </div>
      </form>
    </div>
  );
}
