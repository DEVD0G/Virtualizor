# Roadmap

## Phase 1 — Single Node MVP (dieses Repo, Stand jetzt)

- [x] Backend-Skeleton: Auth (JWT + Refresh), RBAC, Prisma-Schema, Audit
- [x] Node-Join (Token → mTLS-Cert), Heartbeats, Inventar
- [x] VM Lifecycle: create/start/stop/restart/delete via Agent → libvirt
- [x] Task-Queue (BullMQ) + WebSocket-Events
- [x] License-Client: activate/validate/status, Ed25519, Grace Period, Gates
- [x] Frontend: Login, Dashboard, VM-Liste/-Detail, Nodes, License-Status, Dark Mode
- [x] install.sh (Docker, Ubuntu 24.04) + agent-install.sh (bare metal)
- [ ] noVNC-Konsole im Frontend einbetten
- [ ] E2E-Tests (Playwright) + Agent-Integrationstests gegen libvirt-test-Driver

## Phase 2 — Multi-Node & Datenschutzfunktionen

- [ ] Scheduler: least-allocated Placement, Wartungsmodus
- [ ] Snapshots UI komplett (revert/delete, ZFS-Fastpath)
- [ ] Backups: on-demand + Schedules, Retention, Restore, NFS/S3-Targets
- [ ] ISO-/Template-Verwaltung (URL-Import mit Checksum, cloud-init Templates)
- [ ] TOTP-2FA, API-Key-UI
- [ ] Customer-Rolle end-to-end (Ownership, Reinstall, eigene Graphen)

## Phase 3 — Networking & Monitoring

- [ ] VLAN-Management, NAT-Netze mit Port-Forwarding
- [ ] Firewall-Regeln pro VM (nftables-Rendering im Agent)
- [ ] IPAM-UI (Pools, Zuweisungen, Reservierungen)
- [ ] Metrik-Rollups + Graphen (CPU/RAM/Disk/Net), optional Prometheus Remote-Write
- [ ] Node-Alerts (Disk voll, Heartbeat verloren) → UI + Webhooks

## Phase 4 — Enterprise

- [ ] Live-Migration (shared storage; ZFS send/recv für lokal)
- [ ] HA: Watchdog + automatischer VM-Neustart auf anderem Node
- [ ] Panel-HA: 2+ Backend-Replicas, Postgres-Replication-Runbook
- [ ] LXC-Support (optional)
- [ ] SDN-Erweiterungen (VXLAN overlay)
