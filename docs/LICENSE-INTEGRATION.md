# License-Integration (externes System)

Das Lizenzsystem ist ein **separater, externer API-Dienst** und nicht Teil
dieses Produkts. Dieses Dokument beschreibt ausschließlich den **Client** im
Backend (`backend/src/license/`) und den API-Vertrag, den der externe Server
erfüllen muss.

## Prinzipien

1. Das Panel **verwaltet keine Lizenzen** — es prüft Status, aktiviert Nodes
   und schaltet Features frei/zu.
2. Alle Antworten des License-Servers sind **Ed25519-signiert**. Der Public
   Key ist im Panel konfiguriert (`LICENSE_PUBLIC_KEY`, base64). Ohne gültige
   Signatur wird eine Antwort verworfen — auch aus dem lokalen Cache.
3. **Grace Period:** Bei Nichterreichbarkeit gilt die letzte gültige signierte
   Antwort weiter, bis `issuedAt + gracePeriodDays` (vom Server signiert
   vorgegeben, 7–14 Tage) überschritten ist.
4. **Fail-Mode ist degradiert, nie destruktiv:** Nach Ablauf der Grace Period
   werden nur *schreibende* Operationen gesperrt (VM create/clone/restore);
   lesen, starten/stoppen bestehender VMs und die Konsole bleiben verfügbar.
   Laufende VMs werden niemals beendet.

## API-Vertrag (externer Server)

Alle Requests: `Content-Type: application/json`, Header
`X-License-Key: <key>`. Alle Responses haben die Hülle:

```json
{
  "payload": "<base64(JSON)>",
  "signature": "<base64(ed25519_sign(payload_bytes))>"
}
```

### POST /license/activate

Request:
```json
{
  "licenseKey": "VCP-XXXX-XXXX-XXXX",
  "nodeFingerprint": "sha256:...",   // Hash aus machine-id + CPU-Modell + MACs
  "hostname": "hv-01",
  "panelInstanceId": "uuid"          // bei Installation erzeugt
}
```

Payload (entschlüsselt aus `payload`):
```json
{
  "type": "activation",
  "activationId": "uuid",
  "licenseKey": "VCP-XXXX-…",
  "nodeFingerprint": "sha256:...",
  "issuedAt": "2026-06-09T12:00:00Z",
  "status": "active"
}
```

### POST /license/validate

Request: `{ "licenseKey", "nodeFingerprints": ["sha256:..."], "panelInstanceId" }`

Payload:
```json
{
  "type": "validation",
  "status": "active",              // active | suspended | expired | invalid
  "tier": "enterprise",            // starter | pro | enterprise
  "limits": { "maxNodes": 50, "maxVms": 2000 },
  "features": ["ha", "migration", "backups", "vlan", "api"],
  "issuedAt": "2026-06-09T12:00:00Z",
  "expiresAt": "2027-06-09T00:00:00Z",
  "gracePeriodDays": 10,
  "nonce": "..."                   // Anti-Replay: Panel sendet Nonce mit, Server signiert sie zurück
}
```

### POST /license/status

Wie `validate`, aber ohne Aktivierungs-Seiteneffekte; für die UI-Anzeige.

## Client-Verhalten im Backend

```
Beim Boot + alle 6h (BullMQ repeatable job) + manuell via POST /license/refresh:
  1. nonce = random(32B); POST /license/validate {…, nonce}
  2. Signatur gegen LICENSE_PUBLIC_KEY prüfen; nonce vergleichen
  3. ok → rohe Antwort in licenses_cache speichern (upsert), Status in Memory
  4. Netzfehler → Cache lesen, Signatur ERNEUT prüfen,
     issuedAt + gracePeriodDays > now? → Status "grace" (UI-Banner mit Restzeit)
     sonst → Status "unlicensed" → Feature-Gates greifen
  5. status=suspended/expired/invalid (signiert!) → sofort entsprechende Gates
```

### Feature Gates

`LicenseGuard` (NestJS Guard) + Decorator `@RequireFeature('backups')` und
Limit-Checks in den Services (`maxNodes`, `maxVms` vor dem Anlegen). Die UI
liest `GET /license/status` und blendet gesperrte Features aus bzw. zeigt
den Grund an ("Feature nicht in Ihrer Lizenz enthalten").

### Lokale Tabellen (nur Cache, keine Verwaltung)

- `licenses_cache(id, license_key_hash, raw_payload, signature, issued_at,
  expires_at, status, tier, fetched_at)`
- `license_activations(id, node_id, activation_id, node_fingerprint,
  raw_payload, signature, activated_at)`

Beide Tabellen sind reine Caches signierter Server-Antworten; Manipulation
ist wirkungslos, da Signaturen bei jedem Lesen geprüft werden.

## Rate Limiting (Client-seitig)

- validate: max. 1 Call / 5 min (außer manueller Refresh, dort 1/min).
- Exponentielles Backoff bei 5xx/Netzfehlern (30s → 16 min, capped).
