# VCP — Virtualization Control Panel

Ein modernes, on-premise installierbares KVM/QEMU Virtualization Control Panel —
technische Alternative zu Proxmox VE und Virtualizor.

```
┌─────────────┐   HTTPS/WSS   ┌──────────────┐   mTLS HTTPS   ┌─────────────┐
│  Frontend    │ ───────────▶ │   Backend     │ ─────────────▶ │ Node Agent  │
│  React + TS  │              │   NestJS      │                │ Go + libvirt│
└─────────────┘              │  PostgreSQL   │                │ KVM/QEMU    │
                             │  Redis/BullMQ │                └─────────────┘
                             └──────┬───────┘
                                    │ HTTPS (signed responses, Ed25519)
                                    ▼
                          ┌──────────────────┐
                          │ External License  │  ← separates System,
                          │ API (nicht Teil   │    NICHT Teil dieses Produkts
                          │ dieses Repos)     │
                          └──────────────────┘
```

## Komponenten

| Komponente | Pfad | Technologie | Rolle |
|---|---|---|---|
| Backend (Control Plane) | `backend/` | NestJS, Prisma, PostgreSQL, Redis/BullMQ, WebSockets | API, RBAC, VM-Orchestrierung, License-Client |
| Node Agent (Data Plane) | `agent/` | Go, go-libvirt, mTLS | VM Lifecycle auf dem Hypervisor-Host |
| Frontend (Panel UI) | `frontend/` | React, TypeScript, Vite, TailwindCSS | Admin & Customer UI, Dark Mode |
| License System | extern | — | Nur API-Client im Backend (`backend/src/license/`) |

**Kein SaaS-Portal, kein Billing, keine Kundenwebsite** — das Produkt ist ausschließlich
das installierbare Panel + Agent. Das Lizenzsystem ist ein externer API-Dienst; das Panel
prüft nur Status und schaltet Features frei (signierte Antworten, Ed25519-Verifikation,
Grace Period).

## Installation (Ubuntu 24.04)

### Control Panel (Docker)

```bash
curl -fsSL https://raw.githubusercontent.com/devd0g/virtualizor/main/install.sh | sudo bash
```

oder aus dem Repo:

```bash
sudo ./install.sh
```

Das Script installiert Docker, generiert Secrets + mTLS-CA, startet
PostgreSQL, Redis, Backend und Frontend via `docker compose` und legt den
initialen Admin-Account an.

### Node Agent (auf jedem Hypervisor-Host, bare metal)

Der Agent läuft **nicht** in Docker (braucht direkten KVM/libvirt-Zugriff):

```bash
sudo ./scripts/agent-install.sh --panel-url https://panel.example.com --join-token <TOKEN>
```

Installiert KVM/QEMU/libvirt, baut/installiert den Agent, registriert den Node
am Panel (mTLS-Zertifikat wird über den Join-Token ausgestellt) und startet
den systemd-Service `vcp-agent`.

## Entwicklung

```bash
# Infrastruktur (Postgres + Redis)
docker compose -f docker-compose.dev.yml up -d

# Backend
cd backend && npm install && npx prisma migrate dev && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev

# Agent (auf einem Linux-Host mit libvirt)
cd agent && go build ./cmd/vcp-agent && sudo ./vcp-agent --config /etc/vcp/agent.yaml
```

## Dokumentation

- [Architektur](docs/ARCHITECTURE.md) — Komponenten, Datenfluss, Cluster-Design
- [Sicherheit](docs/SECURITY.md) — mTLS, RBAC, Command-Whitelist, Threat Model
- [API](docs/API.md) — REST-API-Referenz
- [License-Integration](docs/LICENSE-INTEGRATION.md) — Externes Lizenzsystem, Verifikation, Grace Period
- [Roadmap](docs/ROADMAP.md) — MVP-Phasen 1–4

## Lizenz

Proprietär. Alle Rechte vorbehalten.
