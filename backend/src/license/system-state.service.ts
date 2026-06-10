// backend/src/license/system-state.service.ts

import { Injectable, Module, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InstallPhase, SystemState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FingerprintModule, FingerprintService } from './fingerprint.service';

export { InstallPhase } from '@prisma/client';

/**
 * Manages the singleton SystemState row that tracks the overall install phase.
 * There is exactly one row with id="singleton"; it is created on first access.
 */
@Injectable()
export class SystemStateService {
  private readonly logger = new Logger(SystemStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fingerprint: FingerprintService,
  ) {}

  /**
   * Returns the singleton row, creating it with defaults if it does not yet exist.
   */
  async getState(): Promise<SystemState> {
    const existing = await this.prisma.systemState.findUnique({
      where: { id: 'singleton' },
    });
    if (existing) return existing;

    // First boot — create the singleton.
    const fp = this.fingerprint.compute();
    this.logger.log(`First boot: creating SystemState (fingerprint=${fp.slice(0, 20)}...)`);
    return this.prisma.systemState.create({
      data: {
        id: 'singleton',
        phase: InstallPhase.locked,
        installId: randomUUID(),
        fingerprint: fp,
      },
    });
  }

  async getPhase(): Promise<InstallPhase> {
    const state = await this.getState();
    return state.phase;
  }

  async setLocked(): Promise<void> {
    await this.prisma.systemState.update({
      where: { id: 'singleton' },
      data: { phase: InstallPhase.locked },
    });
  }

  async setActivating(): Promise<void> {
    // Ensure singleton exists before updating.
    await this.getState();
    await this.prisma.systemState.update({
      where: { id: 'singleton' },
      data: { phase: InstallPhase.activating },
    });
  }

  async setActive(licenseKey: string): Promise<void> {
    await this.getState();
    await this.prisma.systemState.update({
      where: { id: 'singleton' },
      data: {
        phase: InstallPhase.active,
        licenseKey,
        activatedAt: new Date(),
      },
    });
  }

  async updateValidatedAt(): Promise<void> {
    await this.prisma.systemState.update({
      where: { id: 'singleton' },
      data: { lastValidatedAt: new Date() },
    });
  }

  async getInstallId(): Promise<string> {
    const state = await this.getState();
    return state.installId;
  }

  /**
   * Returns the stored fingerprint.  If the stored value is empty (should not
   * happen in normal operation) it recomputes from hardware and persists the
   * fresh value.
   */
  async getFingerprint(): Promise<string> {
    const state = await this.getState();
    if (state.fingerprint) return state.fingerprint;

    const fp = this.fingerprint.compute();
    await this.prisma.systemState.update({
      where: { id: 'singleton' },
      data: { fingerprint: fp },
    });
    return fp;
  }
}

@Module({
  imports: [FingerprintModule],
  providers: [SystemStateService],
  exports: [SystemStateService],
})
export class SystemStateModule {}
