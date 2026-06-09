/**
 * VCP License Server — Fastify HTTP API
 *
 * WICHTIG: Dieser Server ist ein SEPARATES System, nicht Teil des VCP-Panels.
 * Er läuft bei dem SaaS-Anbieter, nicht beim Kunden.
 *
 * Endpoints:
 *   POST /license/activate    — Erstregistrierung einer Installation
 *   POST /license/validate    — Periodische Validierung (signierte Antwort)
 *   POST /license/status      — Leichtgewichtige Statusabfrage
 *   POST /license/deactivate  — Widerruf (Admin-Auth erforderlich)
 *   GET  /health              — Healthcheck
 */

import Fastify from 'fastify';
import { z } from 'zod';
import { handleActivate, handleValidate, handleStatus, handleDeactivate } from './handlers.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!process.env.LICENSE_PRIVATE_KEY) {
  console.error('FATAL: LICENSE_PRIVATE_KEY ist nicht gesetzt');
  process.exit(1);
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: true,
});

// ─── Schema-Validierung ──────────────────────────────────────────────────────

const ActivateSchema = z.object({
  licenseKey: z.string().min(8).max(32),
  installId: z.string().uuid(),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  hostname: z.string().min(1).max(253),
  panelVersion: z.string().optional(),
});

const ValidateSchema = z.object({
  licenseKey: z.string().min(8).max(32),
  installId: z.string().uuid(),
  fingerprints: z.array(z.string()).min(1).max(10),
  nonce: z.string().min(16).max(64),
  panelVersion: z.string().optional(),
});

const StatusSchema = z.object({
  licenseKey: z.string().min(8).max(32),
  installId: z.string().uuid(),
});

const DeactivateSchema = z.object({
  licenseKey: z.string().min(8).max(32),
  installId: z.string().uuid(),
});

// ─── Middleware ───────────────────────────────────────────────────────────────

function getIp(request: any): string {
  return (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? request.ip
    ?? 'unknown';
}

function requireAdminAuth(request: any, reply: any): boolean {
  if (!ADMIN_SECRET) {
    reply.status(503).send({ error: 'ADMIN_NOT_CONFIGURED' });
    return false;
  }
  const auth = request.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_SECRET}`) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return false;
  }
  return true;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

app.post('/license/activate', async (request, reply) => {
  const parsed = ActivateSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.issues });
  }
  const result = await handleActivate(parsed.data, getIp(request));
  if ('error' in result) {
    const status = result.error === 'RATE_LIMITED' ? 429 : 400;
    return reply.status(status).send(result);
  }
  return result;
});

app.post('/license/validate', async (request, reply) => {
  const parsed = ValidateSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'INVALID_REQUEST', details: parsed.error.issues });
  }
  const result = await handleValidate(parsed.data, getIp(request));
  if ('error' in result && result.error === 'RATE_LIMITED') {
    return reply.status(429).send(result);
  }
  return result;
});

app.post('/license/status', async (request, reply) => {
  const parsed = StatusSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'INVALID_REQUEST' });
  }
  const result = await handleStatus(parsed.data.licenseKey, parsed.data.installId, getIp(request));
  if ('error' in result && result.error === 'RATE_LIMITED') {
    return reply.status(429).send(result);
  }
  return result;
});

app.post('/license/deactivate', async (request, reply) => {
  if (!requireAdminAuth(request, reply)) return;
  const parsed = DeactivateSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'INVALID_REQUEST' });
  }
  return handleDeactivate(parsed.data.licenseKey, parsed.data.installId);
});

// ─── Start ───────────────────────────────────────────────────────────────────

try {
  await app.listen({ port: parseInt(process.env.PORT ?? '4000', 10), host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
