/**
 * License-Server Handler — Kernlogik
 *
 * Drei Endpoints:
 *   POST /license/activate   — einmalige Node-Registrierung
 *   POST /license/validate   — periodische Validierung mit Signatur
 *   POST /license/status     — leichtgewichtige Statusabfrage (kein Nonce)
 *   POST /license/deactivate — Aktivierung widerrufen (Admin)
 */

import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { signPayload } from './crypto.js';
import { checkRateLimit } from './rate-limit.js';
import { validateKeyFormat, normalizeKey } from './license-key.js';

const prisma = new PrismaClient();

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ─── Tier-Defaults ──────────────────────────────────────────────────────────

const TIER_DEFAULTS: Record<string, { maxNodes: number; maxVms: number; features: string[]; gracePeriodDays: number }> = {
  starter:    { maxNodes: 3,   maxVms: 50,   features: ['vm.create', 'snapshots', 'api'],                              gracePeriodDays: 7  },
  pro:        { maxNodes: 20,  maxVms: 500,  features: ['vm.create', 'snapshots', 'api', 'backups', 'vlan'],           gracePeriodDays: 10 },
  enterprise: { maxNodes: 200, maxVms: 5000, features: ['vm.create', 'snapshots', 'api', 'backups', 'vlan', 'ha', 'migration', 'lxc'], gracePeriodDays: 14 },
};

// ─── Activate ────────────────────────────────────────────────────────────────

export interface ActivateRequest {
  licenseKey: string;
  installId: string;
  fingerprint: string;
  hostname: string;
  panelVersion?: string;
}

export async function handleActivate(req: ActivateRequest, sourceIp: string) {
  const key = normalizeKey(req.licenseKey);
  if (!validateKeyFormat(key)) {
    return { error: 'INVALID_KEY_FORMAT', message: 'Ungültiges Lizenzschlüssel-Format' };
  }

  // Rate Limiting: 10/h pro IP, 3/h pro Key-Hash
  const rl = checkRateLimit('activate', [`ip:${sourceIp}`, `key:${hashKey(key)}`]);
  if (!rl.allowed) {
    return { error: 'RATE_LIMITED', retryAfterMs: rl.retryAfterMs };
  }

  const license = await prisma.license.findUnique({ where: { keyHash: hashKey(key) } });
  if (!license) {
    return { error: 'LICENSE_NOT_FOUND', message: 'Lizenzschlüssel nicht gefunden' };
  }
  if (license.status !== 'active') {
    return { error: 'LICENSE_INACTIVE', message: `Lizenz ist ${license.status}` };
  }
  if (license.expiresAt && license.expiresAt < new Date()) {
    return { error: 'LICENSE_EXPIRED', message: 'Lizenz ist abgelaufen' };
  }

  // Prüfen ob diese installId schon aktiviert ist (idempotent)
  const existing = await prisma.activation.findUnique({
    where: { licenseId_installId: { licenseId: license.id, installId: req.installId } },
  });
  if (!existing) {
    // Aktivierungs-Limit prüfen (max. 1 gleichzeitige Aktivierung pro Starter, mehr für höhere Tiers)
    const maxActivations = license.tier === 'starter' ? 1 : license.tier === 'pro' ? 3 : 10;
    const activeCount = await prisma.activation.count({
      where: { licenseId: license.id, revokedAt: null },
    });
    if (activeCount >= maxActivations) {
      return { error: 'MAX_ACTIVATIONS', message: `Maximale Aktivierungen (${maxActivations}) erreicht` };
    }
    await prisma.activation.create({
      data: { licenseId: license.id, installId: req.installId, fingerprint: req.fingerprint, hostname: req.hostname },
    });
  } else {
    // Fingerprint-Drift: erlaubt mit Warnung (Hardware kann sich ändern)
    if (existing.fingerprint !== req.fingerprint) {
      await prisma.activation.update({
        where: { id: existing.id },
        data: { fingerprint: req.fingerprint, lastSeenAt: new Date() },
      });
    } else {
      await prisma.activation.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
    }
  }

  const tierDefaults = TIER_DEFAULTS[license.tier] ?? TIER_DEFAULTS.starter;
  const payload = {
    type: 'activation',
    activationId: existing?.id ?? 'new',
    licenseKey: key.slice(0, 7) + '***', // nie den vollen Key in der Antwort
    installId: req.installId,
    fingerprint: req.fingerprint,
    tier: license.tier,
    status: 'active',
    issuedAt: new Date().toISOString(),
  };

  return signPayload(payload);
}

// ─── Validate ────────────────────────────────────────────────────────────────

export interface ValidateRequest {
  licenseKey: string;
  installId: string;
  fingerprints: string[];
  nonce: string;
  panelVersion?: string;
}

export async function handleValidate(req: ValidateRequest, sourceIp: string) {
  const key = normalizeKey(req.licenseKey);

  // Rate Limiting: 5/5min pro IP + 5/5min pro Key-Hash
  const rl = checkRateLimit('validate', [`ip:${sourceIp}`, `key:${hashKey(key)}`]);
  if (!rl.allowed) {
    return { error: 'RATE_LIMITED', retryAfterMs: rl.retryAfterMs };
  }
  if (!req.nonce || req.nonce.length < 16) {
    return { error: 'INVALID_REQUEST', message: 'Nonce fehlt oder zu kurz' };
  }

  const license = await prisma.license.findUnique({ where: { keyHash: hashKey(key) } });
  if (!license) {
    const payload = buildValidationPayload('invalid', 'unknown', {}, [], 7, null, req.nonce);
    return signPayload(payload);
  }

  // Validierungslog schreiben
  await prisma.validationLog.create({
    data: {
      licenseId: license.id,
      installId: req.installId,
      fingerprint: req.fingerprints[0] ?? '',
      sourceIp,
      nonce: req.nonce,
      outcome: license.status === 'active' ? 'success' : license.status,
    },
  }).catch(() => {}); // Log-Fehler darf Validierung nicht blockieren

  if (license.status !== 'active') {
    const payload = buildValidationPayload(license.status, license.tier, {}, [], 0, null, req.nonce);
    return signPayload(payload);
  }
  if (license.expiresAt && license.expiresAt < new Date()) {
    await prisma.license.update({ where: { id: license.id }, data: { status: 'expired' } });
    const payload = buildValidationPayload('expired', license.tier, {}, [], 0, null, req.nonce);
    return signPayload(payload);
  }

  const tierDefaults = TIER_DEFAULTS[license.tier] ?? TIER_DEFAULTS.starter;
  const payload = buildValidationPayload(
    'active',
    license.tier,
    { maxNodes: license.maxNodes, maxVms: license.maxVms },
    license.features,
    tierDefaults.gracePeriodDays,
    license.expiresAt?.toISOString() ?? null,
    req.nonce,
  );
  return signPayload(payload);
}

function buildValidationPayload(
  status: string,
  tier: string,
  limits: object,
  features: string[],
  gracePeriodDays: number,
  expiresAt: string | null,
  nonce: string,
) {
  return {
    type: 'validation',
    status,
    tier,
    limits,
    features,
    gracePeriodDays,
    issuedAt: new Date().toISOString(),
    expiresAt,
    nonce,
  };
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function handleStatus(licenseKey: string, installId: string, sourceIp: string) {
  const key = normalizeKey(licenseKey);
  const rl = checkRateLimit('status', [`ip:${sourceIp}`]);
  if (!rl.allowed) {
    return { error: 'RATE_LIMITED', retryAfterMs: rl.retryAfterMs };
  }

  const license = await prisma.license.findUnique({ where: { keyHash: hashKey(key) } });
  if (!license) {
    return signPayload({ type: 'status', status: 'invalid', issuedAt: new Date().toISOString() });
  }

  const tierDefaults = TIER_DEFAULTS[license.tier] ?? TIER_DEFAULTS.starter;
  return signPayload({
    type: 'status',
    status: license.status,
    tier: license.tier,
    limits: { maxNodes: license.maxNodes, maxVms: license.maxVms },
    features: license.features,
    gracePeriodDays: tierDefaults.gracePeriodDays,
    issuedAt: new Date().toISOString(),
    expiresAt: license.expiresAt?.toISOString() ?? null,
  });
}

// ─── Deactivate (Admin) ──────────────────────────────────────────────────────

export async function handleDeactivate(licenseKey: string, installId: string) {
  const key = normalizeKey(licenseKey);
  const license = await prisma.license.findUnique({ where: { keyHash: hashKey(key) } });
  if (!license) return { error: 'NOT_FOUND' };

  await prisma.activation.updateMany({
    where: { licenseId: license.id, installId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { ok: true };
}
