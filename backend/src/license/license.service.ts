import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes, verify as edVerify } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SystemStateService, InstallPhase } from './system-state.service';

/**
 * Client to the EXTERNAL License API. The panel does not manage licenses —
 * it validates status, activates nodes, and gates features.
 *
 * All server responses are Ed25519-signed ({payload, signature}, both base64).
 * The public key comes from LICENSE_PUBLIC_KEY. Cache entries are re-verified
 * on every read — DB manipulation is ineffective.
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

export interface FullState {
  phase: InstallPhase;
  installId: string;
  fingerprint: string;
  licenseState: LicenseState;
  apiConfigured: boolean;
}

@Injectable()
export class LicenseService implements OnModuleInit {
  private readonly logger = new Logger(LicenseService.name);
  private readonly apiUrl = process.env.LICENSE_API_URL ?? '';
  private readonly publicKey = process.env.LICENSE_PUBLIC_KEY ?? '';
  private state: LicenseState = this.emptyState('unconfigured');

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemState: SystemStateService,
  ) {}

  async onModuleInit() {
    // Ensure singleton exists early so other services can read it.
    await this.systemState.getState().catch((err) =>
      this.logger.warn(`SystemState init: ${err.message}`),
    );

    const phase = await this.systemState.getPhase().catch(() => InstallPhase.locked);

    if (phase === InstallPhase.active) {
      // Non-blocking background refresh — don't block application boot.
      this.refresh().catch((err) =>
        this.logger.warn(`Background license refresh on boot: ${err.message}`),
      );
    } else {
      this.state = this.emptyState('unconfigured');
    }
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledValidation() {
    await this.refresh().catch((err) =>
      this.logger.warn(`Scheduled license validation: ${err.message}`),
    );
  }

  getState(): LicenseState {
    return this.state;
  }

  async getFullState(): Promise<FullState> {
    const phase = await this.systemState.getPhase();
    const installId = await this.systemState.getInstallId();
    const fingerprint = await this.systemState.getFingerprint();
    return {
      phase,
      installId,
      fingerprint,
      licenseState: this.state,
      apiConfigured: Boolean(this.apiUrl && this.publicKey),
    };
  }

  // ─── Feature Gates ─────────────────────────────────────────────────────────

  /**
   * Throws if the system is locked (no license activated yet) or if the
   * license has expired past the grace period.
   */
  async assertWriteAllowed() {
    const phase = await this.systemState.getPhase();
    if (phase === InstallPhase.locked || phase === InstallPhase.activating) {
      throw new ForbiddenException(
        'System gesperrt — Lizenzaktivierung erforderlich',
      );
    }
    if (this.state.status === 'unlicensed') {
      throw new ForbiddenException(
        'Lizenz abgelaufen (Grace Period überschritten) — VM-Erstellung gesperrt. Bestehende VMs laufen weiter.',
      );
    }
  }

  async assertVmLimit() {
    const phase = await this.systemState.getPhase();
    if (phase === InstallPhase.locked || phase === InstallPhase.activating) {
      throw new ForbiddenException(
        'System gesperrt — Lizenzaktivierung erforderlich',
      );
    }
    const max = this.state.limits?.maxVms;
    if (!max) return;
    const count = await this.prisma.vm.count();
    if (count >= max)
      throw new ForbiddenException(`Lizenz-Limit erreicht: max. ${max} VMs`);
  }

  async assertNodeLimit() {
    const phase = await this.systemState.getPhase();
    if (phase === InstallPhase.locked || phase === InstallPhase.activating) {
      throw new ForbiddenException(
        'System gesperrt — Lizenzaktivierung erforderlich',
      );
    }
    const max = this.state.limits?.maxNodes;
    if (!max) return;
    const count = await this.prisma.node.count();
    if (count >= max)
      throw new ForbiddenException(
        `Lizenz-Limit erreicht: max. ${max} Nodes`,
      );
  }

  hasFeature(feature: string): boolean {
    return this.state.features.includes(feature);
  }

  // ─── Activation & Validation ───────────────────────────────────────────────

  /**
   * Self-Hosted-Aktivierung: entsperrt das System OHNE License-Server.
   * Nur erlaubt, wenn keine License API konfiguriert ist — sobald
   * LICENSE_API_URL + LICENSE_PUBLIC_KEY gesetzt sind, ist der normale
   * Aktivierungsweg verpflichtend.
   */
  async activateSelfHosted() {
    if (this.apiUrl && this.publicKey) {
      throw new BadRequestException(
        'License API ist konfiguriert — bitte mit Lizenzschlüssel aktivieren.',
      );
    }
    const phase = await this.systemState.getPhase();
    if (phase === InstallPhase.active) return this.getState();

    await this.systemState.setActive('');
    this.state = this.emptyState('unconfigured');
    this.logger.log('System im Self-Hosted-Modus aktiviert (keine License API konfiguriert).');
    return this.getState();
  }

  async activate(licenseKey: string) {
    if (!this.apiUrl || !this.publicKey) {
      throw new BadRequestException(
        'License API nicht konfiguriert (LICENSE_API_URL / LICENSE_PUBLIC_KEY)',
      );
    }

    // Transition to activating so the UI can show progress.
    await this.systemState.setActivating();

    try {
      // Activate per-node registrations on the license server.
      const nodes = await this.prisma.node.findMany({
        select: { id: true, fingerprint: true, hostname: true },
      });
      for (const node of nodes) {
        const { payload, raw, signature } = await this.callLicenseApi(
          '/license/activate',
          licenseKey,
          { nodeFingerprint: node.fingerprint, hostname: node.hostname },
        );
        await this.prisma.licenseActivation.upsert({
          where: { nodeId: node.id },
          update: {
            activationId: payload.activationId,
            rawPayload: raw,
            signature,
          },
          create: {
            nodeId: node.id,
            activationId: payload.activationId,
            nodeFingerprint: node.fingerprint,
            rawPayload: raw,
            signature,
          },
        });
      }

      // Persist the license key and transition to active.
      process.env.LICENSE_KEY = licenseKey;
      await this.systemState.setActive(licenseKey);

      // Perform immediate full validation to populate in-memory state.
      const result = await this.refresh();
      await this.systemState.updateValidatedAt();
      return result;
    } catch (err) {
      // Roll back to locked so the UI can retry.
      await this.systemState.setLocked().catch(() => undefined);
      throw err;
    }
  }

  async refresh(): Promise<LicenseState> {
    // If not yet active, resolve key from SystemState first.
    const phase = await this.systemState.getPhase().catch(() => InstallPhase.locked);
    let licenseKey = process.env.LICENSE_KEY;

    if (!licenseKey && phase === InstallPhase.active) {
      const ss = await this.systemState.getState();
      licenseKey = ss.licenseKey ?? undefined;
      if (licenseKey) process.env.LICENSE_KEY = licenseKey;
    }

    if (!this.apiUrl || !this.publicKey || !licenseKey) {
      this.state = this.emptyState('unconfigured');
      return this.state;
    }

    const fingerprints = (
      await this.prisma.node.findMany({ select: { fingerprint: true } })
    ).map((n) => n.fingerprint);

    try {
      const nonce = randomBytes(32).toString('base64url');
      const { payload, raw, signature } = await this.callLicenseApi(
        '/license/validate',
        licenseKey,
        { nodeFingerprints: fingerprints, nonce },
      );
      if (payload.nonce !== nonce) throw new Error('Nonce-Mismatch (Replay?)');

      await this.prisma.licenseCache.upsert({
        where: { licenseKeyHash: this.hash(licenseKey) },
        update: {
          rawPayload: raw,
          signature,
          status: payload.status,
          tier: payload.tier,
          issuedAt: new Date(payload.issuedAt),
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
          fetchedAt: new Date(),
        },
        create: {
          licenseKeyHash: this.hash(licenseKey),
          rawPayload: raw,
          signature,
          status: payload.status,
          tier: payload.tier,
          issuedAt: new Date(payload.issuedAt),
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        },
      });

      this.state = this.stateFromPayload(payload, false);
      await this.systemState.updateValidatedAt().catch(() => undefined);
    } catch (err: any) {
      this.logger.warn(
        `License server unreachable/invalid: ${err.message} — checking cache`,
      );
      this.state = await this.stateFromCache(licenseKey);
    }
    return this.state;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async callLicenseApi(
    path: string,
    licenseKey: string,
    body: Record<string, any>,
  ): Promise<{ payload: any; raw: string; signature: string }> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-License-Key': licenseKey,
      },
      body: JSON.stringify({
        licenseKey,
        panelInstanceId: process.env.PANEL_INSTANCE_ID,
        ...body,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`License API ${path} → HTTP ${res.status}`);
    const envelope = (await res.json()) as {
      payload: string;
      signature: string;
    };
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
          // SPKI header for Ed25519 raw key (32 bytes)
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
      this.logger.error('Cache signature invalid — cache tampered?');
      return this.emptyState('unlicensed');
    }

    const graceEnd =
      new Date(payload.issuedAt).getTime() +
      payload.gracePeriodDays * 86_400_000;
    const remainingMs = graceEnd - Date.now();
    if (payload.status === 'active' && remainingMs > 0) {
      const state = this.stateFromPayload(payload, true);
      state.graceRemainingDays = Math.ceil(remainingMs / 86_400_000);
      return state;
    }
    return this.emptyState('unlicensed');
  }

  private stateFromPayload(
    payload: ValidationPayload,
    grace: boolean,
  ): LicenseState {
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
      // Unconfigured (dev/eval): everything allowed; unlicensed: gates apply.
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
