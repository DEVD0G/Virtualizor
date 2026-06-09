// backend/src/license/fingerprint.service.ts

import { Global, Injectable, Module } from '@nestjs/common';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Computes a deterministic hardware fingerprint from multiple stable system
 * sources. Each source failure is silently swallowed (returns empty string)
 * so that a partial fingerprint is always possible rather than a boot failure.
 *
 * Format: sha256:<64 lowercase hex chars>
 */
@Injectable()
export class FingerprintService {
  /** Returns a stable sha256:<hex> fingerprint of this machine. */
  compute(): string {
    const parts = [
      this.machineId(),
      this.cpuModel(),
      this.macAddresses(),
      this.boardSerial(),
    ];
    const raw = parts.join('|');
    const hex = createHash('sha256').update(raw).digest('hex');
    return `sha256:${hex}`;
  }

  // ─── Sources ───────────────────────────────────────────────────────────────

  private machineId(): string {
    try {
      return readFileSync('/etc/machine-id', 'utf8').trim();
    } catch {
      return '';
    }
  }

  private cpuModel(): string {
    try {
      const content = readFileSync('/proc/cpuinfo', 'utf8');
      for (const line of content.split('\n')) {
        if (line.startsWith('model name')) {
          const idx = line.indexOf(':');
          if (idx !== -1) return line.slice(idx + 1).trim();
        }
      }
      return '';
    } catch {
      return '';
    }
  }

  private macAddresses(): string {
    // Try parsing /proc/net/if_inet6 first (lists IPv6-capable interfaces).
    // That file shows iface names but not MACs, so we fall through to `ip link`.
    const macs = this.macsFromIpLink();
    return macs
      .filter((m) => m !== '')
      .sort()
      .join(',');
  }

  private macsFromIpLink(): string[] {
    try {
      // ip -o link show  → one line per interface, e.g.:
      //   2: eth0: <...> link/ether 52:54:00:ab:cd:ef brd ...
      const out = execFileSync('/sbin/ip', ['-o', 'link', 'show'], {
        timeout: 5_000,
        encoding: 'utf8',
      });
      const macs: string[] = [];
      const macRe = /link\/ether\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})/gi;
      // Filter out loopback entries
      for (const line of out.split('\n')) {
        if (/LOOPBACK/i.test(line)) continue;
        let m: RegExpExecArray | null;
        while ((m = macRe.exec(line)) !== null) {
          macs.push(m[1].toLowerCase());
        }
      }
      return macs;
    } catch {
      return [];
    }
  }

  private boardSerial(): string {
    try {
      return readFileSync('/sys/class/dmi/id/board_serial', 'utf8').trim();
    } catch {
      return '';
    }
  }
}

@Global()
@Module({
  providers: [FingerprintService],
  exports: [FingerprintService],
})
export class FingerprintModule {}
