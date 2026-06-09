# Security Design

## Authentifizierung & Autorisierung

### Benutzer (Frontend → Backend)
- **JWT**: kurzlebige Access-Tokens (15 min) + Refresh-Tokens (7 d, rotierend,
  in DB whitelisted → Logout/Revoke serverseitig wirksam).
- Passwörter: Argon2id (memory 64 MiB, iterations 3).
- Login-Rate-Limit: 5 Versuche / 15 min pro IP+User (Redis).
- Optional TOTP-2FA (Phase 2).

### API-Automatisierung
- API-Keys: `vcp_<id>_<secret>` — nur SHA-256-Hash gespeichert, Scopes =
  Teilmenge der Permissions des erstellenden Users, optionales Ablaufdatum,
  IP-Allowlist pro Key.

### RBAC
- Permissions sind feingranulare Strings: `vm.create`, `vm.delete`,
  `vm.console`, `node.manage`, `user.manage`, `network.manage`,
  `storage.manage`, `backup.manage`, `audit.read`, `license.read` …
- Rollen bündeln Permissions; Seeds: `admin` (alle), `operator`
  (VM/Node-Betrieb, keine User-/Lizenzverwaltung), `customer`
  (nur eigene VMs: zusätzlich Ownership-Check auf Ressourcenebene).
- Enforcement: `PermissionsGuard` (Decorator `@RequirePermissions(...)`) +
  Ownership-Filter in den Services (`WHERE owner_id = :userId` für
  Nicht-Admins).

## Transport-Sicherheit

| Pfad | Schutz |
|---|---|
| Browser → Frontend/Backend | TLS (Reverse Proxy/nginx), HSTS, CSP |
| Backend → Agent | **mTLS**: interne CA (bei Installation erzeugt), Agent verlangt Client-Cert der Panel-CA, Backend pinnt Agent-SPKI-Hash aus der Registrierung |
| Backend → License API | TLS + **Ed25519-Signaturverifikation** der Response-Payloads (Schutz auch gegen MITM mit gefälschtem CA-Cert) |
| Agent → Backend (Heartbeat) | mTLS mit dem Node-Zertifikat; Node-Identität = Cert-CN |

mTLS-Zertifikate: ECDSA P-256, Node-Certs 1 Jahr gültig, automatische
Rotation 30 Tage vor Ablauf über den Heartbeat-Kanal.

## Node Agent Hardening

1. **Keine generische Kommandoausführung.** Es existiert kein
   `exec`-/`shell`-Endpoint. Die API-Oberfläche ist die Whitelist.
2. **Strikte Input-Validierung** an jedem Endpoint:
   - VM-/Volume-Namen: `^[a-z0-9][a-z0-9-]{2,62}$`
   - Pfade: müssen nach `filepath.Clean` unterhalb der konfigurierten
     Storage-Roots liegen (Prefix-Check nach Symlink-Auflösung).
   - Größen/Limits: harte Obergrenzen aus der Agent-Config.
3. **Kein Shell-Interpreter.** Externe Tools (`qemu-img`, `zfs`) werden mit
   festem Binärpfad und Argument-Array gestartet (`exec.Command`), niemals
   über `sh -c`.
4. **libvirt über lokalen Unix-Socket**, kein TCP-libvirtd.
5. **Anti-Spoofing pro VM:** nftables-Regeln erlauben nur die zugewiesene
   MAC/IP auf dem tap-Interface.
6. Systemd-Unit: `ProtectSystem=full` wo möglich, `NoNewPrivileges=yes`
   ist wegen libvirt-Root-Bedarf nicht überall machbar — kompensiert durch
   minimale API-Oberfläche.

## Audit Logging

Jede mutierende API-Operation erzeugt einen Audit-Eintrag:
`(timestamp, actor_user_id | api_key_id, action, resource_type, resource_id,
source_ip, user_agent, outcome, details_json)`. Audit-Logs sind
append-only (kein UPDATE/DELETE über die App; DB-Rolle des Backends hat
kein DELETE-Recht auf `audit_logs`).

## Rate Limiting

- Global: 300 req/min pro IP (nginx + Backend-Throttler).
- Auth-Endpoints: 5/15min (siehe oben).
- License-API-Calls ausgehend: max. 1 validate / Node / 5 min (Schutz des
  externen Servers, zusätzlich serverseitiges Limit dort).

## License Anti-Tamper (Client-Seite)

- Antworten der License API sind Ed25519-signiert; der Public Key liegt als
  Konfiguration/Build-Konstante im Backend. Manipulierte Antworten oder ein
  gefälschter License-Server scheitern an der Signatur.
- Cache-Einträge speichern die **rohe signierte Antwort** und werden bei
  jedem Lesen erneut verifiziert (DB-Manipulation nutzlos).
- Grace-Period-Dauer kommt aus der signierten Antwort selbst, nicht aus
  lokaler Config.
- Fail-Mode: degradiert, niemals destruktiv (laufende VMs unangetastet).

## Threat Model (Auszug)

| Bedrohung | Gegenmaßnahme |
|---|---|
| Gestohlenes Admin-Passwort | 2FA (Phase 2), Refresh-Revocation, Audit-Log, Login-Alerts |
| Kompromittiertes Backend | Agents akzeptieren nur typisierte Ops → kein Host-RCE "by design"; Blast Radius = VM-Verwaltung |
| Kompromittierter Node | Node-Cert gilt nur für diesen Node; Panel-API für Agents ist auf Heartbeat/Task-Callbacks beschränkt; keine Querzugriffe auf andere Nodes |
| MITM Panel↔Agent | mTLS + SPKI-Pinning |
| Lizenz-Spoofing | Ed25519-Signaturen, Key nicht auf dem System |
| SQL-Injection | Prisma (parametrisiert), keine Raw-Queries mit User-Input |
| XSS | React-Escaping, CSP `default-src 'self'`, keine `dangerouslySetInnerHTML` |
| CSRF | Bearer-Token (kein Cookie-basiertes Auth für mutierende Calls) |
