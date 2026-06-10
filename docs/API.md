# REST API Referenz (v1)

Base URL: `/api/v1` · Auth: `Authorization: Bearer <jwt>` oder `X-Api-Key: vcp_...`
Alle Antworten JSON. Fehlerformat: `{ "statusCode": 4xx, "message": "...", "error": "..." }`

## Auth

| Methode | Pfad | Beschreibung |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → `{accessToken, refreshToken, user}` |
| POST | `/auth/refresh` | `{refreshToken}` → neue Tokens (Rotation) |
| POST | `/auth/logout` | Refresh-Token widerrufen |
| GET | `/auth/me` | Aktueller User inkl. Permissions |

## VMs

| Methode | Pfad | Permission | Beschreibung |
|---|---|---|---|
| GET | `/vms` | `vm.read` | Liste (Customer: nur eigene), Filter `?nodeId=&state=` |
| POST | `/vms` | `vm.create` | VM anlegen (async, gibt `taskId` zurück) |
| GET | `/vms/:id` | `vm.read` | Details inkl. Disks, NICs, IPs |
| DELETE | `/vms/:id` | `vm.delete` | Löschen inkl. Volumes (async) |
| POST | `/vms/:id/start` | `vm.power` | Starten |
| POST | `/vms/:id/stop` | `vm.power` | `{force?: boolean}` — ACPI oder destroy |
| POST | `/vms/:id/restart` | `vm.power` | Neustart |
| POST | `/vms/:id/snapshots` | `vm.snapshot` | `{name, description?}` |
| GET | `/vms/:id/snapshots` | `vm.read` | Snapshot-Liste |
| POST | `/vms/:id/snapshots/:snapId/revert` | `vm.snapshot` | Zurückrollen |
| DELETE | `/vms/:id/snapshots/:snapId` | `vm.snapshot` | Snapshot löschen |
| GET | `/vms/:id/console` | `vm.console` | VNC-Token + WebSocket-URL |
| GET | `/vms/:id/metrics` | `vm.read` | CPU/RAM/Disk/Net Zeitreihen |

`POST /vms` Body:

```json
{
  "name": "web-01",
  "nodeId": "optional — sonst Scheduler",
  "vcpus": 2,
  "memoryMb": 4096,
  "disks": [{ "sizeGb": 40, "storagePoolId": "..." }],
  "nics": [{ "networkId": "...", "ipPoolId": "..." }],
  "templateId": "ubuntu-24.04",
  "cloudInit": { "sshKeys": ["ssh-ed25519 ..."], "userData": "..." },
  "ownerId": "optional (admin only)"
}
```

## Nodes

| Methode | Pfad | Permission | Beschreibung |
|---|---|---|---|
| GET | `/nodes` | `node.read` | Liste mit Status, Auslastung |
| POST | `/nodes/join-tokens` | `node.manage` | Join-Token erzeugen (15 min TTL) |
| POST | `/nodes/join` | — (Token) | Agent-Registrierung: `{token, csr, fingerprint, hostname}` |
| GET | `/nodes/:id` | `node.read` | Details, VMs, Kapazität |
| PATCH | `/nodes/:id` | `node.manage` | Wartungsmodus, Overcommit-Ratio |
| DELETE | `/nodes/:id` | `node.manage` | Entfernen (nur ohne VMs) |
| POST | `/nodes/:id/heartbeat` | — (mTLS Node-Cert) | Agent-Heartbeat |

## Netzwerke & IPs

| Methode | Pfad | Permission |
|---|---|---|
| GET/POST | `/networks` | `network.read` / `network.manage` |
| GET/POST | `/networks/:id/ip-pools` | dito |
| GET | `/ip-addresses?vmId=` | `network.read` |
| GET/POST/DELETE | `/vms/:id/firewall-rules` | `vm.firewall` |

## Storage, ISOs, Templates

| Methode | Pfad | Permission |
|---|---|---|
| GET/POST | `/storage-pools` | `storage.read` / `storage.manage` |
| GET/POST/DELETE | `/isos` | `storage.manage` (POST = URL-Import mit SHA-256) |
| GET/POST/DELETE | `/templates` | `storage.manage` |

## Backups

| Methode | Pfad | Permission |
|---|---|---|
| GET/POST | `/vms/:id/backups` | `backup.read` / `backup.manage` |
| POST | `/vms/:id/backups/:backupId/restore` | `backup.manage` |
| GET/POST | `/backup-schedules` | `backup.manage` |

## Users, Rollen, API-Keys, Audit

| Methode | Pfad | Permission |
|---|---|---|
| GET/POST/PATCH/DELETE | `/users` | `user.manage` |
| GET/POST/PATCH/DELETE | `/roles` | `user.manage` |
| GET | `/permissions` | `user.manage` |
| GET/POST/DELETE | `/api-keys` | eigene: jeder; fremde: `user.manage` |
| GET | `/audit-logs` | `audit.read` |

## Lizenz (nur Status — keine Verwaltung)

| Methode | Pfad | Permission | Beschreibung |
|---|---|---|---|
| GET | `/license/status` | `license.read` | Status, Tier, Limits, Grace-Info |
| POST | `/license/activate` | `license.manage` | License-Key eingeben → Aktivierung gegen externe API |
| POST | `/license/refresh` | `license.manage` | Sofortige Revalidierung anstoßen |

## Tasks & Events

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/tasks/:id` | Task-Status (`queued/running/succeeded/failed`, Progress, Error) |
| WS | `/events` (Socket.IO) | Rooms: `vm:<id>`, `node:<id>`, `tasks`; Events: `vm.state`, `node.state`, `task.update`, `metrics` |

## Agent-API (intern, nur mTLS, Port 8443 auf jedem Node)

Nicht öffentlich — vollständige Whitelist:

```
GET  /v1/health                      POST /v1/vms                  (create+define+start)
GET  /v1/inventory                   POST /v1/vms/{name}/start
GET  /v1/metrics                     POST /v1/vms/{name}/stop      {force}
POST /v1/vms/{name}/snapshot         POST /v1/vms/{name}/restart
POST /v1/vms/{name}/snapshot-revert  DELETE /v1/vms/{name}         (undefine+volumes)
DELETE /v1/vms/{name}/snapshots/{s}  POST /v1/volumes              POST /v1/isos/import
POST /v1/vms/{name}/backup           POST /v1/firewall/apply       POST /v1/console-token
```
