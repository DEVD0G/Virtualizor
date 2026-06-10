import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Node } from '@prisma/client';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { Agent as HttpsAgent, request } from 'https';
import { TLSSocket } from 'tls';

export interface VmCreateSpec {
  name: string;
  vcpus: number;
  memoryMb: number;
  disks: { name: string; sizeGb: number; poolPath: string; templateUrl?: string; templateSha256?: string }[];
  nics: { mac: string; bridge: string; vlanTag?: number; ip?: string; gateway?: string; dns?: string[] }[];
  cloudInit?: { sshKeys?: string[]; userData?: string; hostname?: string };
}

/**
 * Einziger Kommunikationsweg in die Data Plane: mTLS-HTTPS zu den Agents.
 * Das Agent-Zertifikat wird gegen den bei der Registrierung gespeicherten
 * SPKI-Pin geprüft (zusätzlich zur CA-Validierung).
 */
@Injectable()
export class AgentClientService {
  private readonly logger = new Logger(AgentClientService.name);
  private readonly clientCert = readFileSync(process.env.VCP_CLIENT_CERT ?? '/certs/panel-client.crt');
  private readonly clientKey = readFileSync(process.env.VCP_CLIENT_KEY ?? '/certs/panel-client.key');
  private readonly caCert = readFileSync(process.env.VCP_CA_CERT ?? '/certs/ca.crt');

  createVm(node: Node, spec: VmCreateSpec) {
    return this.call(node, 'POST', '/v1/vms', spec);
  }

  startVm(node: Node, name: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(name)}/start`);
  }

  stopVm(node: Node, name: string, force: boolean) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(name)}/stop`, { force });
  }

  restartVm(node: Node, name: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(name)}/restart`);
  }

  deleteVm(node: Node, name: string) {
    return this.call(node, 'DELETE', `/v1/vms/${encodeURIComponent(name)}`);
  }

  cloneVm(node: Node, sourceName: string, targetName: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(sourceName)}/clone`, { targetName });
  }

  migrateVm(node: Node, vmName: string, targetAddress: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(vmName)}/migrate`, { targetAddress });
  }

  mountIso(node: Node, vmName: string, isoUrl: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(vmName)}/iso/mount`, { isoUrl });
  }

  unmountIso(node: Node, vmName: string) {
    return this.call(node, 'DELETE', `/v1/vms/${encodeURIComponent(vmName)}/iso`);
  }

  createContainer(node: Node, spec: { name: string; vcpus: number; memoryMb: number; diskGb: number; osTemplate: string; ipAddress?: string }) {
    return this.call(node, 'POST', '/v1/containers', spec);
  }

  startContainer(node: Node, name: string) {
    return this.call(node, 'POST', `/v1/containers/${encodeURIComponent(name)}/start`);
  }

  stopContainer(node: Node, name: string) {
    return this.call(node, 'POST', `/v1/containers/${encodeURIComponent(name)}/stop`);
  }

  restartContainer(node: Node, name: string) {
    return this.call(node, 'POST', `/v1/containers/${encodeURIComponent(name)}/restart`);
  }

  deleteContainer(node: Node, name: string) {
    return this.call(node, 'DELETE', `/v1/containers/${encodeURIComponent(name)}`);
  }

  snapshotVm(node: Node, name: string, snapshotName: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(name)}/snapshot`, { name: snapshotName });
  }

  revertSnapshot(node: Node, name: string, snapshotName: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(name)}/snapshot-revert`, { name: snapshotName });
  }

  deleteSnapshot(node: Node, name: string, snapshotName: string) {
    return this.call(node, 'DELETE',
      `/v1/vms/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snapshotName)}`);
  }

  applyFirewall(node: Node, vmName: string, rules: object[]) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(vmName)}/firewall/apply`, rules);
  }

  resizeVm(node: Node, name: string, vcpus: number, memoryMb: number) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(name)}/resize`, { vcpus, memoryMb });
  }

  resizeDisk(node: Node, vmName: string, diskPath: string, newSizeGb: number) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(vmName)}/disks/resize`, { diskPath, newSizeGb });
  }

  backupVm(node: Node, name: string, targetDir?: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(name)}/backup`,
      targetDir ? { targetDir } : {});
  }

  restoreVm(node: Node, name: string, backupPath: string) {
    return this.call(node, 'POST', `/v1/vms/${encodeURIComponent(name)}/restore`, { backupPath });
  }

  consoleToken(node: Node, name: string) {
    return this.call(node, 'POST', '/v1/console-token', { vmName: name });
  }

  health(node: Node) {
    return this.call(node, 'GET', '/v1/health');
  }

  private call(node: Node, method: string, path: string, body?: unknown): Promise<any> {
    const [host, portStr] = node.agentAddress.split(':');
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    return new Promise((resolve, reject) => {
      const req = request(
        {
          host,
          port: parseInt(portStr ?? '8443', 10),
          path,
          method,
          agent: new HttpsAgent({
            cert: this.clientCert,
            key: this.clientKey,
            ca: this.caCert,
            // Agent-Cert CN = Hostname des Nodes, nicht dessen IP → eigener Check unten
            checkServerIdentity: () => undefined,
          }),
          headers: {
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          timeout: 120_000,
        },
        (res) => {
          // SPKI-Pinning: Identität des Agents über den registrierten Key
          const socket = res.socket as TLSSocket;
          const peerCert = socket.getPeerCertificate();
          const pin = createHash('sha256').update(peerCert.pubkey!).digest('base64');
          if (pin !== node.certSpkiPin) {
            req.destroy();
            return reject(new ServiceUnavailableException('Agent-Zertifikat-Pin stimmt nicht überein'));
          }

          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              this.logger.warn(`Agent ${node.name} ${method} ${path} → ${res.statusCode}: ${data}`);
              return reject(new ServiceUnavailableException(`Agent-Fehler (${res.statusCode}): ${data}`));
            }
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch {
              resolve({});
            }
          });
        },
      );
      req.on('error', (err) => {
        this.logger.error(`Agent ${node.name} nicht erreichbar: ${err.message}`);
        reject(new ServiceUnavailableException(`Node-Agent nicht erreichbar: ${err.message}`));
      });
      req.on('timeout', () => req.destroy(new Error('Timeout')));
      if (payload) req.write(payload);
      req.end();
    });
  }
}
