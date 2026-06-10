# VCP License & Installation System

Technical reference for the VCP licensing architecture, hardware fingerprinting,
data structures, license server API, and security model.

---

## 1. System Flow (Installation → Activation → Runtime)

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  INSTALL TIME                                                           │
  │                                                                         │
  │  install.sh runs on a fresh host                                        │
  │       │                                                                 │
  │       ▼                                                                 │
  │  Docker / systemd brings up NestJS backend                              │
  │       │                                                                 │
  │       ▼                                                                 │
  │  onModuleInit → SystemStateService.getState()                           │
  │       │   • Row not found → create singleton                            │
  │       │     – phase  = locked                                           │
  │       │     – installId = randomUUID()                                  │
  │       │     – fingerprint = FingerprintService.compute()                │
  │       ▼                                                                 │
  │  LicenseService.onModuleInit                                            │
  │       │   • phase == locked → state = unconfigured, no refresh          │
  │       │                                                                 │
  │  LockedGuard (APP_GUARD #1) starts rejecting non-allowlist requests     │
  └─────────────────────────────────────────────────────────────────────────┘
              │
              │  (operator navigates to https://panel.host/)
              ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  FIRST-BOOT UI (ActivationPage)                                         │
  │                                                                         │
  │  React App.tsx                                                          │
  │       │  GET /api/v1/license/system-state  (public, no auth)           │
  │       │  ← { phase: "locked", installId, fingerprint, licenseState }   │
  │       │                                                                 │
  │       │  phase != "active" → render <ActivationPage />                  │
  │       ▼                                                                 │
  │  Operator copies installId + fingerprint to license portal             │
  │  Receives license key:  VCP-XXXX-XXXX-XXXX-XXXX                        │
  │       │                                                                 │
  │       │  POST /api/v1/license/activate  { licenseKey }                  │
  │       ▼                                                                 │
  │  LicenseService.activate()                                              │
  │       │  1. SystemStateService.setActivating()  → phase = activating   │
  │       │  2. For each Node:                                              │
  │       │       POST license-server /license/activate                     │
  │       │       ← signed ActivationPayload                                │
  │       │       upsert LicenseActivation row                              │
  │       │  3. SystemStateService.setActive(licenseKey)                    │
  │       │       → phase = active, licenseKey stored, activatedAt = now   │
  │       │  4. LicenseService.refresh() → full validation                  │
  │       │  5. SystemStateService.updateValidatedAt()                      │
  │       │                                                                 │
  │       │  On any error → SystemStateService.setLocked() (rollback)       │
  └─────────────────────────────────────────────────────────────────────────┘
              │
              ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  RUNTIME                                                                │
  │                                                                         │
  │  LockedGuard: phase == active → passes every request through            │
  │                                                                         │
  │  App.tsx: phase == "active" → normal React route tree                  │
  │                                                                         │
  │  @Cron(EVERY_6_HOURS) scheduledValidation()                            │
  │       │  POST license-server /license/validate                          │
  │       │  Verify Ed25519 signature                                       │
  │       │  Check nonce (anti-replay)                                      │
  │       │  Upsert LicenseCache row                                        │
  │       │  Update in-memory LicenseState                                  │
  │       │                                                                 │
  │  If license-server unreachable:                                         │
  │       │  Read LicenseCache from DB                                      │
  │       │  Re-verify signature (tamper-proof)                             │
  │       │  Compute grace period from issuedAt + gracePeriodDays          │
  │       │  If within grace: status = "grace"                              │
  │       │  If past grace:   status = "unlicensed"                         │
  │                                                                         │
  │  Feature gates:                                                         │
  │       assertWriteAllowed() → throws 403 if unlicensed or locked        │
  │       assertVmLimit()      → throws 403 if count >= maxVms             │
  │       assertNodeLimit()    → throws 403 if count >= maxNodes           │
  │       hasFeature(name)     → boolean                                    │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Hardware Fingerprint

### Sources used

| # | Source | Path / Command | Notes |
|---|--------|----------------|-------|
| 1 | Machine ID | `/etc/machine-id` | systemd-generated UUID, stable per install |
| 2 | CPU model name | `/proc/cpuinfo` `model name` field | First occurrence |
| 3 | MAC addresses | `/sbin/ip -o link show` | Loopback filtered, sorted, comma-joined |
| 4 | DMI board serial | `/sys/class/dmi/id/board_serial` | Motherboard serial from BIOS/UEFI |

All sources are joined with `|` before hashing:

```
<machine-id>|<cpu-model>|<mac1>,<mac2>|<board-serial>
```

If a source cannot be read (permission error, file not present, command failure), it
contributes an empty string. The hash is still computed — a partial fingerprint is
preferable to a boot failure.

### Why each source was chosen

- **`/etc/machine-id`**: stable across reboots, unique per OS installation, present on
  all systemd-based distributions. Changes only on OS reinstall.
- **CPU model**: ties the license to the physical processor class. Stable across kernel
  upgrades and reboots. Does not change unless the CPU is physically replaced.
- **MAC addresses**: network interfaces are hardware-bound; add diversity to bare-metal
  vs. VM fingerprints. Sorted to be order-independent.
- **DMI board serial**: motherboard identifier, very stable. Available on bare-metal;
  often present in VMs but may be empty or virtualised.

### Stability analysis

| Source | Stable across reboot | Stable across kernel upgrade | Changes on hardware swap | Changes on VM migration |
|--------|---------------------|-----------------------------|--------------------------|-----------------------|
| machine-id | Yes | Yes | No (OS reinstall = new ID) | No (new image) |
| CPU model | Yes | Yes | Yes, if CPU replaced | Possibly, if host changed |
| MAC addresses | Yes (wired NICs) | Yes | Yes, if NIC replaced | Yes, often |
| DMI board serial | Yes | Yes | Yes, if motherboard replaced | No (passed through) |

Recommendation: accept fingerprint drift of up to 1 source and prompt re-activation
on the license portal rather than hard-locking.

### Format specification

```
sha256:<64 lowercase hexadecimal characters>
```

Example:
```
sha256:a3f1e2d4b6c8091e2a4f5d6e7b8c9012345678901234567890abcdef01234567
```

---

## 3. License Data Structures

### LicenseRequest (panel → license server)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LicenseRequest",
  "type": "object",
  "required": ["licenseKey", "panelInstanceId"],
  "properties": {
    "licenseKey":       { "type": "string", "minLength": 8 },
    "panelInstanceId":  { "type": "string", "format": "uuid" },
    "nodeFingerprints": {
      "type": "array",
      "items": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
    },
    "nonce": { "type": "string", "description": "base64url random bytes, validation only" }
  }
}
```

### LicenseResponse (signed envelope, license server → panel)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LicenseResponse",
  "type": "object",
  "required": ["payload", "signature"],
  "properties": {
    "payload":   {
      "type": "string",
      "description": "base64-encoded UTF-8 JSON (ValidationPayload or ActivationPayload)"
    },
    "signature": {
      "type": "string",
      "description": "base64-encoded Ed25519 signature over the raw payload bytes"
    }
  }
}
```

### ValidationPayload (inside signed payload, /license/validate)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ValidationPayload",
  "type": "object",
  "required": ["type","status","tier","limits","features","issuedAt","gracePeriodDays","nonce"],
  "properties": {
    "type":            { "type": "string", "const": "validation" },
    "status":          { "type": "string", "enum": ["active","suspended","expired","invalid"] },
    "tier":            { "type": "string", "description": "e.g. starter, pro, enterprise" },
    "limits": {
      "type": "object",
      "required": ["maxNodes","maxVms"],
      "properties": {
        "maxNodes": { "type": "integer", "minimum": 0 },
        "maxVms":   { "type": "integer", "minimum": 0 }
      }
    },
    "features":        { "type": "array", "items": { "type": "string" } },
    "issuedAt":        { "type": "string", "format": "date-time" },
    "expiresAt":       { "type": "string", "format": "date-time" },
    "gracePeriodDays": { "type": "integer", "minimum": 0 },
    "nonce":           { "type": "string", "description": "Echoed from request — anti-replay" }
  }
}
```

### ActivationPayload (inside signed payload, /license/activate)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ActivationPayload",
  "type": "object",
  "required": ["type","activationId","licenseKey","nodeFingerprint","activatedAt","tier","limits","features"],
  "properties": {
    "type":            { "type": "string", "const": "activation" },
    "activationId":    { "type": "string", "format": "uuid" },
    "licenseKey":      { "type": "string" },
    "nodeFingerprint": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
    "activatedAt":     { "type": "string", "format": "date-time" },
    "tier":            { "type": "string" },
    "limits": {
      "type": "object",
      "properties": {
        "maxNodes": { "type": "integer" },
        "maxVms":   { "type": "integer" }
      }
    },
    "features":        { "type": "array", "items": { "type": "string" } }
  }
}
```

### SystemStateRecord (stored in Postgres `system_state` table)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SystemStateRecord",
  "type": "object",
  "required": ["id","phase","installId","fingerprint","updatedAt"],
  "properties": {
    "id":              { "type": "string", "const": "singleton" },
    "phase":           { "type": "string", "enum": ["locked","activating","active"] },
    "installId":       { "type": "string", "format": "uuid" },
    "fingerprint":     { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
    "licenseKey":      { "type": ["string","null"], "description": "Plaintext; encrypt at rest via DB encryption or env-keyed cipher" },
    "activatedAt":     { "type": ["string","null"], "format": "date-time" },
    "lastValidatedAt": { "type": ["string","null"], "format": "date-time" },
    "updatedAt":       { "type": "string", "format": "date-time" }
  }
}
```

---

## 4. License Server API Design

Base URL: `https://license.vcp.io/v1`

All requests and responses use `Content-Type: application/json`.
All requests include: `X-License-Key: <key>` header and `licenseKey` in the JSON body.
All successful responses return a signed envelope: `{ "payload": "<base64>", "signature": "<base64>" }`.

### Rate limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /license/activate | 10 req | per key per hour |
| POST /license/validate | 60 req | per key per hour |
| POST /license/status | 60 req | per key per hour |
| POST /license/deactivate | 5 req | per key per day |

Rate limit responses: HTTP 429, body `{ "error": "rate_limit_exceeded", "retryAfterSeconds": N }`.

---

### POST /license/activate

Registers a node fingerprint against a license key. Idempotent — the same
fingerprint can be activated multiple times (returns the same activationId).

**Request**

```json
{
  "licenseKey":      "VCP-XXXX-XXXX-XXXX-XXXX",
  "panelInstanceId": "uuid",
  "nodeFingerprint": "sha256:...",
  "hostname":        "node01.example.com"
}
```

**Response 200** — signed `ActivationPayload`

```json
{
  "payload":   "<base64-json>",
  "signature": "<base64-ed25519>"
}
```

**Error responses**

| HTTP | `error` field | Meaning |
|------|---------------|---------|
| 400 | `invalid_request` | Missing or malformed fields |
| 402 | `payment_required` | License key exists but subscription lapsed |
| 403 | `key_invalid` | License key unknown or revoked |
| 403 | `node_limit_exceeded` | Too many nodes activated for this tier |
| 429 | `rate_limit_exceeded` | See rate limits table |
| 503 | `service_unavailable` | Upstream issue; retry after `retryAfterSeconds` |

---

### POST /license/validate

Validates license state and returns current entitlements. Called every 6 hours
by the panel; response is cached in `licenses_cache` for offline grace periods.

**Request**

```json
{
  "licenseKey":       "VCP-XXXX-XXXX-XXXX-XXXX",
  "panelInstanceId":  "uuid",
  "nodeFingerprints": ["sha256:...", "sha256:..."],
  "nonce":            "<base64url-32-bytes>"
}
```

**Response 200** — signed `ValidationPayload` (nonce echoed back)

**Error responses**

| HTTP | `error` field | Meaning |
|------|---------------|---------|
| 400 | `invalid_request` | Missing or malformed fields |
| 403 | `key_invalid` | License key unknown or revoked |
| 403 | `key_suspended` | License suspended (pending payment) |

---

### POST /license/status

Lightweight check that returns the current license status without a full
validation payload. Suitable for dashboard polling.

**Request**

```json
{
  "licenseKey":      "VCP-XXXX-XXXX-XXXX-XXXX",
  "panelInstanceId": "uuid"
}
```

**Response 200**

```json
{
  "payload":   "<base64-json: { type:'status', status, tier, expiresAt }>",
  "signature": "<base64-ed25519>"
}
```

---

### POST /license/deactivate

Releases a node activation slot. Called when a node is removed from the cluster.

**Request**

```json
{
  "licenseKey":      "VCP-XXXX-XXXX-XXXX-XXXX",
  "panelInstanceId": "uuid",
  "activationId":    "uuid"
}
```

**Response 200**

```json
{
  "payload":   "<base64-json: { type:'deactivation', activationId, deactivatedAt }>",
  "signature": "<base64-ed25519>"
}
```

**Error responses**

| HTTP | `error` field | Meaning |
|------|---------------|---------|
| 403 | `key_invalid` | License key does not match activationId |
| 404 | `activation_not_found` | activationId unknown |

---

## 5. Security Analysis

### Binary patching / license check bypass

| | |
|-|-|
| **Attack** | Attacker modifies the compiled Node.js bundle or TypeScript source to skip guard checks (`assertWriteAllowed`, `LockedGuard`). |
| **Difficulty** | Medium for a local attacker with filesystem access; low on an open-source codebase. |
| **Protection** | (a) The license key is validated server-side on each `activate` call — the license server rejects bad keys regardless of local code. (b) For SaaS / managed deployments: sign the container image with Sigstore/cosign and verify at startup. (c) All signed responses are re-verified on every DB read, not just on fetch, so even if checks are removed the signed envelopes remain coherent. (d) Audit logs record all write operations; anomalies (writes without a prior successful validation) are detectable by the operator. |

---

### DB manipulation (edit licenses_cache)

| | |
|-|-|
| **Attack** | Attacker edits `rawPayload` or `signature` in `licenses_cache` to claim a higher tier or extend expiry. |
| **Difficulty** | Low if they have Postgres credentials. |
| **Protection** | Every cache read re-runs `edVerify(null, payloadBytes, publicKey, signatureBytes)`. A forged payload won't match the Ed25519 signature. The public key is embedded in the panel binary (env var `LICENSE_PUBLIC_KEY`); without the private key the signature cannot be recomputed. Even a `NULL` signature → `verifyAndParse` throws → state falls back to `unlicensed`. |

---

### Network MITM (fake license server)

| | |
|-|-|
| **Attack** | Attacker intercepts traffic between the panel and `license.vcp.io`, returning fabricated responses. |
| **Difficulty** | Medium (requires control of network path or DNS). |
| **Protection** | (a) All communication over HTTPS with certificate pinning (configure `NODE_EXTRA_CA_CERTS` or pin via custom fetch agent). (b) Even if TLS is bypassed, the Ed25519 signature of responses must verify against the hardcoded public key — a MITM without the private key cannot produce valid signatures. (c) Nonces in `/license/validate` prevent replaying old valid responses. |

---

### Clock manipulation (extend grace period)

| | |
|-|-|
| **Attack** | Attacker sets the system clock backward to stay within the grace window after the license expires. |
| **Difficulty** | Low on a server with root access. |
| **Protection** | (a) Grace period is computed from `issuedAt` (in the signed payload, set by the server) plus `gracePeriodDays`, not from the panel's own clock minus expiry. If the panel clock is moved backward, `Date.now() < graceEnd` remains true — but the next successful `/license/validate` will return a fresh `issuedAt` that anchors the grace window to real time. (b) The license server can refuse to issue a new `validation` response if the `issuedAt` of the last cached response is suspiciously old (server-side monotonic check). (c) For production deployments, enable NTP enforcement (`timedatectl set-ntp true`) and alert on large clock skew. |

---

### Hardware fingerprint spoofing

| | |
|-|-|
| **Attack** | Attacker copies the `fingerprint` value from a licensed installation and sets it on an unlicensed machine (e.g. by writing to `/etc/machine-id` and spoofing MAC addresses). |
| **Difficulty** | Medium to high — requires matching all four sources simultaneously. |
| **Protection** | (a) The license server binds each activation to a `(licenseKey, nodeFingerprint)` tuple. Multiple active activations for the same fingerprint are flagged. (b) The license server tracks activation count per key; exceeding `maxNodes` is rejected. (c) For higher assurance, add a TPM-backed attestation source to the fingerprint computation. |

---

### Replay attacks (reuse valid responses)

| | |
|-|-|
| **Attack** | Attacker captures a valid `/license/validate` response and replays it later to keep the cache "fresh" after the real license expires. |
| **Difficulty** | Low if the attacker has DB write access. |
| **Protection** | (a) Every validation request includes a 32-byte random `nonce` (base64url). The server echoes the nonce in the signed payload. The panel asserts `payload.nonce === requestNonce` before accepting the response — a replayed old response will have a different nonce and be rejected. (b) Even if a cached entry is replayed, it is re-verified on every read. The `issuedAt` in the payload allows the panel to enforce a maximum cache age. |

---

### Brute-force of license keys

| | |
|-|-|
| **Attack** | Attacker submits millions of guesses for valid license keys against `/api/v1/license/activate`. |
| **Difficulty** | Trivially automatable without rate limiting. |
| **Protection** | (a) The panel's `/license/activate` endpoint is throttled: 5 requests per key per minute (NestJS Throttler). (b) The license server applies its own rate limiting: 10 activations per key per hour + global IP-based limits. (c) License keys use a 128-bit entropy namespace (5 × 4 alphanumeric groups ≈ 2^100 combinations). (d) Invalid keys return HTTP 403 in constant time to prevent timing oracles. |

---

### Offline cracking

| | |
|-|-|
| **Attack** | Attacker obtains a `rawPayload` + `signature` pair and attempts to forge signatures for a modified payload without the private key. |
| **Difficulty** | Computationally infeasible with Ed25519. |
| **Protection** | Ed25519 is based on Curve25519 with a 256-bit security level. Forgery requires solving the elliptic curve discrete logarithm problem — currently infeasible with any known classical or near-term quantum algorithm. The private key never leaves the license server. The 32-byte public key embedded in the panel binary can be rotated if compromised; rotation requires a panel update. |

---

## 6. UX Flow

### First-boot activation (step by step)

1. **Operator deploys VCP** via `install.sh` or `docker-compose up`.
   The backend creates the `system_state` singleton row with `phase = locked`.

2. **Operator navigates to the panel URL** (e.g. `https://panel.example.com/`).
   The React app fetches `GET /api/v1/license/system-state` (public endpoint).
   Because `phase !== 'active'`, `<ActivationPage />` is rendered instead of the
   normal route tree — no login screen is shown.

3. **Activation screen displays**:
   - The VCP logo and "Welcome to VCP" heading.
   - The **Install ID** — a UUID unique to this installation. The operator needs
     this to obtain a license key from the VCP portal.
   - The **Hardware Fingerprint** (abbreviated) — shown for reference;
     the full value is available via copy button.
   - A license key input field with the placeholder `VCP-XXXX-XXXX-XXXX-XXXX`.

4. **Operator visits `https://portal.vcp.io`**, creates an account, purchases a
   plan, and enters the Install ID + fingerprint to obtain a license key.

5. **Operator pastes the license key** into the input field and clicks "Aktivieren".

6. **The panel sends** `POST /api/v1/license/activate { licenseKey }` (no auth token
   required). The backend transitions to `phase = activating`, contacts the license
   server, and on success transitions to `phase = active`.

7. **Success banner is shown**: "Lizenz aktiviert — System wird entsperrt…".
   After 2 seconds the app redirects to `/`, which now shows the normal login screen
   (or dashboard if a session cookie already exists).

8. **Subsequent boots**: `phase = active`, so the activation screen is never shown.
   The `@Cron` every 6 hours re-validates silently in the background.

---

## 7. Best Practices for Production SaaS

1. **Encrypt the license key at rest.** The `licenseKey` column in `system_state`
   stores the key in plaintext by default. Add an application-level cipher keyed by
   an env secret (`LICENSE_ENCRYPTION_KEY`). Use AES-256-GCM; store
   `iv:ciphertext:tag` as a single string. This way even full DB dumps do not expose
   the customer's license key.

2. **Pin the license server TLS certificate.** Configure the panel's HTTP client to
   accept only the known CA or the leaf certificate of `license.vcp.io`. This
   eliminates MITM attacks even in environments with corporate proxy certificate
   injection. Rotate the pin as part of the normal certificate renewal process.

3. **Enforce NTP and alert on clock skew.** Add a startup check that compares the
   system time against an NTP server. If skew exceeds ±5 minutes, log a warning and
   optionally refuse to start. This makes clock-manipulation attacks visible.

4. **Implement activation seat tracking on the server.** The license server should
   record `(licenseKey, nodeFingerprint, activationId)` tuples and enforce `maxNodes`
   strictly. Provide a deactivation endpoint so operators can recover seats after
   legitimate hardware changes (node replacement, migration).

5. **Use short-lived signed validation responses.** Keep `gracePeriodDays` low
   (7–14 days) and `issuedAt` as close to real-time as possible. This limits how
   long an offline attacker can operate after a license is revoked or the key is
   transferred to a new installation.

6. **Rotate the Ed25519 key pair annually.** Embed the public key in the panel
   binary but design an update path: the panel can accept signatures from N public
   keys (key rotation window). Revoke old keys after all active installations have
   upgraded. Track key IDs in the signed payload (`"keyId": "2026-01"`).

7. **Instrument and alert on license validation failures.** Send a metric or
   webhook when the panel falls back to the offline grace cache. Operators should
   know if their license server connectivity breaks before the grace period expires.
   Expose a Prometheus counter `license_validation_failures_total` labelled by
   `reason` (network_error, signature_invalid, nonce_mismatch, expired).
