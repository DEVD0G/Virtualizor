# Architektur

## 1. Überblick

VCP besteht aus genau vier Komponenten. Drei davon sind Teil dieses Produkts,
die vierte (License API) ist ein externer Dienst, mit dem nur per HTTPS
kommuniziert wird.

```
                        ┌────────────────────────────────────────────┐
                        │              CONTROL PLANE                  │
                        │                                            │
 Browser ── HTTPS/WSS ──▶  Frontend (nginx)  ──▶  Backend (NestJS)   │
                        │                          │        │        │
                        │                    PostgreSQL   Redis      │
                        │                    (state)    (queue/pubsub)│
                        └──────────────────────────┬─────────────────┘
                                                   │ mTLS HTTPS :8443
                     ┌─────────────────────────────┼──────────────────┐
                     ▼                             ▼                  ▼
              ┌────────────┐               ┌────────────┐      ┌────────────┐
              │ Node Agent  │               │ Node Agent  │      │ Node Agent │
              │ (Go)        │               │ (Go)        │      │ (Go)       │
              │ libvirt/KVM │               │ libvirt/KVM │      │ libvirt/KVM│
              └────────────┘               └────────────┘      └────────────┘
                   DATA PLANE (ein Agent pro Hypervisor-Host)

              Backend ── HTTPS (signed, Ed25519) ──▶ External License API
```

### Designprinzipien

1. **Control Plane / Data Plane Trennung.** Das Backend hält den gewünschten
   Zustand (PostgreSQL); Agents setzen ihn auf den Hosts um. Fällt das Panel
   aus, laufen alle VMs weiter — libvirt ist die Source of Truth für den
   Laufzeitzustand, die DB für den Soll-Zustand.
2. **Agents sind dumm und sicher.** Kein Shell-Zugriff, keine generische
   Kommando-Ausführung. Der Agent exponiert eine endliche, explizit
   implementierte Menge von Operationen (Command Whitelist by construction).
3. **Pull + Push hybrid.** Agents melden sich per Heartbeat (Push, alle 10s);
   Befehle gehen synchron vom Backend zum Agent (Push über mTLS). Lange
   Operationen (Backup, Migration) laufen als Tasks mit Status-Callbacks.
4. **Alles asynchron über Queues.** VM-Operationen sind BullMQ-Jobs mit
   Idempotenz-Keys, Retries und Status-Events über Redis Pub/Sub → WebSocket.
5. **Lizenz nur als Client.** Signierte Antworten, lokaler Cache, Grace
   Period. Keinerlei Billing-/Portal-Logik im Produkt.

## 2. Backend (Control Plane)

**Stack:** NestJS (TypeScript), Prisma ORM, PostgreSQL 16, Redis 7 (BullMQ +
Pub/Sub), Socket.IO für WebSockets.

### Module (`backend/src/`)

| Modul | Verantwortung |
|---|---|
| `auth/` | JWT (access + refresh), Login, API-Key-Auth, Guards |
| `users/` | User CRUD, Rollen-Zuweisung |
| `rbac/` | Rollen & Permissions (`vm.create`, `node.manage`, …) |
| `nodes/` | Node-Registrierung (Join-Token → mTLS-Cert), Heartbeats, Inventar |
| `agent/` | mTLS-HTTP-Client zu den Agents (einziger Weg in die Data Plane) |
| `vms/` | VM Lifecycle, Spezifikation, Placement (Scheduler), Snapshots |
| `tasks/` | BullMQ-Queue, Worker, Task-Statusverfolgung |
| `networks/` | Bridges, VLANs, NAT, IP-Pools, IP-Zuweisung, Firewall-Regeln |
| `storage/` | Storage-Pools (ZFS/LVM/dir/NFS), Volumes, ISOs, Templates |
| `backups/` | Backup-Jobs, Schedules, Retention |
| `license/` | Client zur externen License API, Ed25519-Verify, Feature Gates |
| `audit/` | Audit-Log-Interceptor (wer, was, wann, von wo) |
| `events/` | WebSocket-Gateway (VM-Status, Node-Status, Task-Progress) |
| `apikeys/` | API-Keys für Automatisierung (gescoped auf Permissions) |

### VM-Lifecycle-Flow

```
POST /api/v1/vms
  → AuthGuard (JWT) → PermissionsGuard (vm.create) → LicenseGuard (Feature/Limit)
  → VmsService.create(): DB-Row (state=provisioning), IP aus Pool reservieren,
    Placement-Entscheidung (Scheduler: freie CPU/RAM/Disk je Node)
  → TasksService.enqueue('vm.provision', {vmId})
  → Worker: AgentClient.createVm(node, spec)
       Agent: Volume anlegen → cloud-init ISO → Domain-XML → define → start
  → Status-Callbacks → DB-Update → Redis Pub/Sub → WebSocket → UI live
```

Jeder Task hat einen Idempotenz-Key (`vm.provision:<vmId>`); der Agent
behandelt Wiederholungen idempotent (existiert die Domain schon → ok).

### Scheduler (Placement)

Phase 1: explizite Node-Wahl oder "least allocated" (RAM-gewichtet).
Phase 3+: Anti-Affinity, Overcommit-Ratios pro Node, Wartungsmodus-Drain.

### Cluster-Koordination

Kein eigenes Konsensprotokoll in Phase 1–3: PostgreSQL ist der einzige
Koordinationspunkt (Locks via `SELECT ... FOR UPDATE`, Advisory Locks für
Scheduler-Läufe). Das Backend ist horizontal skalierbar (stateless, Queue in
Redis). HA des Panels selbst (Phase 4) = 2+ Backend-Replicas hinter LB +
Postgres-Streaming-Replication — bewusst kein Raft im Produktkern.

## 3. Node Agent (Data Plane)

**Stack:** Go ≥1.22, `digitalocean/go-libvirt` (reines Go-RPC über den
libvirt-Unix-Socket — kein cgo, kein virsh-Shellout), systemd-Service,
läuft als root auf dem Hypervisor-Host (notwendig für libvirt/Storage).

### Pakete (`agent/internal/`)

| Paket | Verantwortung |
|---|---|
| `server/` | mTLS-HTTPS-Server (:8443), nur Client-Certs der Panel-CA |
| `virt/` | libvirt: Domain-XML-Erzeugung, define/start/stop/destroy, Snapshots |
| `storage/` | qcow2/ZFS-Volumes, ISO-Download (Checksum-verifiziert), cloud-init |
| `netw/` | Bridge/VLAN-Anbindung, nftables-Regeln pro VM (Anti-Spoofing) |
| `metrics/` | /proc + libvirt-Stats: CPU, RAM, Disk, Net pro Host und VM |
| `heartbeat/` | POST an Panel alle 10s: Status, Inventar-Hash, Metriken |
| `vnc/` | Token-basierter VNC/SPICE-Proxy (websockify-kompatibel) |

### Sicherheit des Agents

- **mTLS beidseitig:** Agent akzeptiert nur Client-Zertifikate, die von der
  Panel-CA signiert sind; das Panel pinnt das Agent-Zertifikat (SPKI-Hash,
  bei der Registrierung gespeichert).
- **Whitelist by construction:** Es gibt keinen "exec"-Endpoint. Jede
  Operation ist ein eigener, typisierter Handler mit strikter
  Input-Validierung (VM-Namen `^[a-z0-9-]{3,63}$`, Pfade nur unterhalb
  konfigurierter Roots, keine Pfad-Traversal).
- **Kein Shell-Spawn** für VM-Operationen; alles über libvirt-RPC und
  Go-Syscalls. Einzige Ausnahmen: fest kodierte Binärpfade mit
  Argument-Arrays (`qemu-img`, `zfs`) — niemals String-Interpolation in
  eine Shell.

### Registrierung (Node Join)

```
Admin erzeugt Join-Token im Panel (einmalig, 15 min TTL, an Node-Name gebunden)
agent-install.sh → POST /api/v1/nodes/join {token, csr, fingerprint}
Backend validiert Token → signiert CSR mit Panel-CA → liefert Cert + CA zurück
Agent speichert Cert, startet mTLS-Server, beginnt Heartbeats
```

Hardware-Fingerprint (Maschinen-ID + CPU + MACs, gehasht) wird gespeichert
und für die Lizenz-Aktivierung pro Node verwendet.

## 4. Frontend

**Stack:** React 18, TypeScript, Vite, TailwindCSS, React Router,
TanStack Query, Socket.IO-Client. Ausgeliefert als statisches Bundle über
nginx (gleicher Origin wie API → kein CORS in Produktion).

- **Admin-UI:** Nodes, alle VMs, Storage, Netzwerke, Users/RBAC, Audit-Log,
  Lizenz-Status (nur Anzeige), ISO/Template-Verwaltung.
- **Customer-UI:** dieselbe App, RBAC-gefiltert — ein User mit Rolle
  `customer` sieht nur eigene VMs (Ownership auf VM-Ebene), Konsole,
  Snapshots, Reinstall, Graphen.
- Dark Mode (class-Strategie), Live-Updates über WebSocket, optimistische
  UI für Start/Stop.

## 5. Externes License System (nicht Teil des Produkts)

Im Produkt existiert nur der **Client** (`backend/src/license/`):

- `POST {LICENSE_API}/license/activate` — einmalig pro Node (license key +
  hardware fingerprint) → signierte Activation.
- `POST {LICENSE_API}/license/validate` — alle 6h pro Node; Antwort ist
  Ed25519-signiert; Public Key ist ins Backend einkompiliert/konfiguriert.
- `POST {LICENSE_API}/license/status` — On-Demand für die UI-Anzeige.

Verhalten bei Nichterreichbarkeit: zuletzt gültige signierte Antwort wird
aus `licenses_cache` verwendet, solange `issued_at + grace_period` (Default
10 Tage, vom Server in der signierten Antwort vorgegeben, 7–14 d) nicht
überschritten ist. Danach: Panel bleibt lesbar, schreibende VM-Operationen
werden gesperrt — **laufende VMs werden niemals angefasst**.
Details: [LICENSE-INTEGRATION.md](LICENSE-INTEGRATION.md).

## 6. Storage-Architektur

| Typ | Implementierung | Snapshots | Live-Migration |
|---|---|---|---|
| `dir` (qcow2) | qemu-img auf lokalem FS | qcow2 internal/external | mit Storage-Copy |
| `zfs` | zvol pro Disk | zfs snapshot/clone (instant) | mit zfs send/recv |
| `nfs` | qcow2 auf Shared Mount | qcow2 | ja (shared) |
| `iscsi`/`lvm` | LV pro Disk | LVM-Snapshots | ja (shared LUN) |

Backups: Snapshot → `qemu-img convert`/`zfs send` → Backup-Target
(lokal/NFS/S3-kompatibel), Retention nach Schedule (BullMQ repeatable jobs).

## 7. Networking

- **Bridged:** VM-NIC an Host-Bridge (`vmbr0`), optional VLAN-Tag (802.1q).
- **NAT:** internes Bridge-Netz + nftables-Masquerade, Port-Forwards
  verwaltet über das Panel.
- **IPAM:** IP-Pools (CIDR) in PostgreSQL, Zuweisung transaktional;
  Anti-Spoofing per nftables (nur zugewiesene IP/MAC darf senden).
- **Firewall:** Regeln pro VM (Richtung, Proto, Port, CIDR) → Agent rendert
  nftables-Chains `vcp-vm-<id>`.

## 8. Datenmodell

Siehe `backend/prisma/schema.prisma`. Kerntabellen: `users`, `roles`,
`permissions`, `role_permissions`, `nodes`, `vms`, `vm_snapshots`,
`networks`, `ip_pools`, `ip_addresses`, `storage_pools`, `volumes`,
`isos`, `templates`, `backups`, `firewall_rules`, `tasks`,
`licenses_cache`, `license_activations`, `audit_logs`, `api_keys`,
`join_tokens`.

## 9. Skalierungsgrenzen (Design-Ziele)

- 200 Nodes / 10.000 VMs pro Panel-Instanz (Heartbeat 10s ⇒ 20 req/s — trivial).
- Metriken: Agent aggregiert auf 30s-Auflösung; Rohdaten bleiben auf dem
  Node; Panel speichert Rollups (Phase 3: optionales Prometheus-Remote-Write).
- WebSocket-Fanout über Redis-Adapter ⇒ Backend horizontal skalierbar.
