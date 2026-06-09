import {
  BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes, verify as edVerify } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Client zur EXTERNEN License API. Das Panel verwaltet keine Lizenzen —
 * es prüft Status, aktiviert Nodes und schaltet Features frei.
 *
 * Alle Antworten des Servers sind Ed25519-signiert ({payload, signature},
 * beide base64). Der Public Key kommt aus LICENSE_PUBLIC_KEY. Cache-Einträge
 * werden bei jedem Lesen ERNEUT verifiziert — DB-Manipulation ist wirkungslos.
 */

export interface ValidationPayload {
  type: 'validation';
  status: 'active' | 'suspended' | 'expired' | 'invalid';
  tier: string;
  limits: { maxNodes: number; maxVms: number };
  features: string[];
  issuedAt: string;
  expiresAt?: string;
  gracePeriodDays: number;
  nonce: string;
}

export type EffectiveStatus = 'active' | 'grace' | 'unlicensed' | 'unconfigured';

export interface LicenseState {
  status: EffectiveStatus;
  tier: string | null;
  limits: { maxNodes: number; maxVms: number } | null;
  features: string[];
  graceRemainingDays: number | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
}

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private readonly apiUrl = process.env.LICENSE_API_URL ?? '';
  private readonly publicKey = process.env.LICENSE_PUBLIC_KEY ?? '';
  private state: LicenseState = this.emptyState('unconfigured');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh().catch((err) => this.logger.warn(`Initiale Lizenzprüfung: ${err.message}`));
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledValidation() {
    await this.refresh().catch((err) => this.logger.warn(`Lizenzprüfung: ${err.message}`));
  }

  getState(): LicenseState {
    return this.state;
  }

  // ─── Feature Gates ─────────────────────────────────────────────────────────

  /** Schreibende VM-Operationen erfordern active oder grace. Lese-/Power-Ops bleiben immer erlaubt. */
  async assertWriteAllowed() {
    if (this.state.status === 'unlicensed') {
      throw new ForbiddenException(
        'Lizenz abgelaufen (Grace Period überschritten) — VM-Erstellung gesperrt. Bestehende VMs laufen weiter.',
      );
    }
  }

  async assertVmLimit() {
    const max = this.state.limits?.maxVms;
    if (!max) return;
    const count = await this.prisma.vm.count();
    if (count >= max) throw new ForbiddenException(`Lizenz-Limit erreicht: max. ${max} VMs`);
  }

  async assertNodeLimit() {
    const max = this.state.limits?.maxNodes;
    if (!max) return;
    const count = await this.prisma.node.count();
    if (count >= max) throw new ForbiddenException(`Lizenz-Limit erreicht: max. ${max} Nodes`);
  }

  hasFeature(feature: string): boolean {
    return this.state.features.includes(feature);
  }

  // ─── Aktivierung & Validierung ─────────────────────────────────────────────

  async activate(licenseKey: string) {
    if (!this.apiUrl || !this.publicKey) {
      throw new BadRequestException('License API nicht konfiguriert (LICENSE_API_URL / LICENSE_PUBLIC_KEY)');
    }
    const nodes = await this.prisma.node.findMany({ select: { id: true, fingerprint: true, hostname: true } });
    for (const node of nodes) {
      const { payload, raw, signature } = await this.callLicenseApi('/license/activate', licenseKey, {
        nodeFingerprint: node.fingerprint,
        hostname: node.hostname,
      });
      await this.prisma.licenseActivation.upsert({
        where: { nodeId: node.id },
        update: { activationId: payload.activationId, rawPayload: raw, signature },
        create: {
          nodeId: node.id,
          activationId: payload.activationId,
          nodeFingerprint: node.fingerprint,
          rawPayload: raw,
          signature,
        },
      });
    }
    process.env.LICENSE_KEY = licenseKey;
    return this.refresh();
  }

  async refresh(): Promise<LicenseState> {
    const licenseKey = process.env.LICENSE_KEY;
    if (!this.apiUrl || !this.publicKey || !licenseKey) {
      this.state = this.emptyState('unconfigured');
      return this.state;
    }

    const fingerprints = (
      await this.prisma.node.findMany({ select: { fingerprint: true } })
    ).map((n) => n.fingerprint);

    try {
      const nonce = randomBytes(32).toString('base64url');
      const { payload, raw, signature } = await this.callLicenseApi('/license/validate', licenseKey, {
        nodeFingerprints: fingerprints,
        nonce,
      });
      if (payload.nonce !== nonce) throw new Error('Nonce-Mismatch (Replay?)');

      await this.prisma.licenseCache.upsert({
        where: { licenseKeyHash: this.hash(licenseKey) },
        update: {
          rawPayload: raw, signature, status: payload.status, tier: payload.tier,
          issuedAt: new Date(payload.issuedAt),
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
          fetchedAt: new Date(),
        },
        create: {
          licenseKeyHash: this.hash(licenseKey),
          rawPayload: raw, signature, status: payload.status, tier: payload.tier,
          issuedAt: new Date(payload.issuedAt),
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        },
      });

      this.state = this.stateFromPayload(payload, false);
    } catch (err: any) {
      this.logger.warn(`License-Server nicht erreichbar/ungültig: ${err.message} — prüfe Cache`);
      this.state = await this.stateFromCache(licenseKey);
    }
    return this.state;
  }

  // ─── Intern ────────────────────────────────────────────────────────────────

  private async callLicenseApi(
    path: string,
    licenseKey: string,
    body: Record<string, any>,
  ): Promise<{ payload: any; raw: string; signature: string }> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-License-Key': licenseKey },
      body: JSON.stringify({
        licenseKey,
        panelInstanceId: process.env.PANEL_INSTANCE_ID,
        ...body,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`License API ${path} → HTTP ${res.status}`);
    const envelope = (await res.json()) as { payload: string; signature: string };
    const payload = this.verifyAndParse(envelope.payload, envelope.signature);
    return { payload, raw: envelope.payload, signature: envelope.signature };
  }

  private verifyAndParse(payloadB64: string, signatureB64: string): any {
    const payloadBytes = Buffer.from(payloadB64, 'base64');
    const ok = edVerify(
      null,
      payloadBytes,
      {
        key: Buffer.concat([
          // SPKI-Header für Ed25519 raw key (32 Bytes)
          Buffer.from('302a300506032b6570032100', 'hex'),
          Buffer.from(this.publicKey, 'base64'),
        ]),
        format: 'der',
        type: 'spki',
      },
      Buffer.from(signatureB64, 'base64'),
    );
    if (!ok) throw new Error('Ungültige Ed25519-Signatur der License-Antwort');
    return JSON.parse(payloadBytes.toString('utf8'));
  }

  private async stateFromCache(licenseKey: string): Promise<LicenseState> {
    const cached = await this.prisma.licenseCache.findUnique({
      where: { licenseKeyHash: this.hash(licenseKey) },
    });
    if (!cached) return this.emptyState('unlicensed');

    let payload: ValidationPayload;
    try {
      payload = this.verifyAndParse(cached.rawPayload, cached.signature);
    } catch {
      this.logger.error('Cache-Signatur ungültig — Cache manipuliert?');
      return this.emptyState('unlicensed');
    }

    const graceEnd = new Date(payload.issuedAt).getTime() + payload.gracePeriodDays * 86_400_000;
    const remainingMs = graceEnd - Date.now();
    if (payload.status === 'active' && remainingMs > 0) {
      const state = this.stateFromPayload(payload, true);
      state.graceRemainingDays = Math.ceil(remainingMs / 86_400_000);
      return state;
    }
    return this.emptyState('unlicensed');
  }

  private stateFromPayload(payload: ValidationPayload, grace: boolean): LicenseState {
    if (payload.status !== 'active') return this.emptyState('unlicensed');
    return {
      status: grace ? 'grace' : 'active',
      tier: payload.tier,
      limits: payload.limits,
      features: payload.features,
      graceRemainingDays: null,
      expiresAt: payload.expiresAt ?? null,
      lastValidatedAt: payload.issuedAt,
    };
  }

  private emptyState(status: EffectiveStatus): LicenseState {
    return {
      status,
      tier: null,
      limits: null,
      // Unkonfiguriert (Dev/Eval): alles erlaubt; unlicensed: Gates greifen
      features: status === 'unconfigured' ? ['*'] : [],
      graceRemainingDays: null,
      expiresAt: null,
      lastValidatedAt: null,
    };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
