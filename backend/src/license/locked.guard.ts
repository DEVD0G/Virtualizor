import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InstallPhase, SystemStateService } from './system-state.service';

/**
 * Global guard that enforces the install-phase lock.
 *
 * When the system is in `locked` or `activating` phase only a small allowlist
 * of paths are permitted.  All other requests receive 503 with a JSON body so
 * that API clients and the front-end can detect the locked state reliably.
 */

const ALLOWED_PATHS_WHEN_LOCKED = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/health',
  '/api/v1/license/system-state',
  '/api/v1/license/activate',
  '/api/v1/license/activate-self-hosted',
]);

/** How long (ms) to cache the phase before re-querying the DB. */
const PHASE_CACHE_TTL_MS = 5_000;

@Injectable()
export class LockedGuard implements CanActivate {
  private readonly logger = new Logger(LockedGuard.name);

  /** Cached phase value. */
  private cachedPhase: InstallPhase = InstallPhase.locked;
  /** Timestamp of the last cache refresh (epoch ms). */
  private cacheRefreshedAt = 0;
  /** True while a refresh is in-flight (prevents stampede). */
  private refreshInFlight = false;

  constructor(private readonly systemState: SystemStateService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.maybeRefreshCache();

    if (
      this.cachedPhase !== InstallPhase.locked &&
      this.cachedPhase !== InstallPhase.activating
    ) {
      // System is active — let every other guard and handler take over.
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const path = req.path;

    if (ALLOWED_PATHS_WHEN_LOCKED.has(path)) {
      return true;
    }

    const res = http.getResponse<Response>();
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      locked: true,
      phase: this.cachedPhase,
      message: 'System gesperrt — Lizenzaktivierung erforderlich',
    });
    return false;
  }

  // ─── Cache helpers ─────────────────────────────────────────────────────────

  private async maybeRefreshCache(): Promise<void> {
    const now = Date.now();
    if (now - this.cacheRefreshedAt < PHASE_CACHE_TTL_MS) {
      // Still within TTL — use cached value.
      return;
    }

    if (this.refreshInFlight) {
      // Another async call is already refreshing; use the stale value for now.
      return;
    }

    this.refreshInFlight = true;
    try {
      this.cachedPhase = await this.systemState.getPhase();
      this.cacheRefreshedAt = Date.now();
    } catch (err: any) {
      this.logger.warn(`Could not refresh phase cache: ${err.message}`);
      // Keep the old (safe/locked) cached value.
    } finally {
      this.refreshInFlight = false;
    }
  }
}
