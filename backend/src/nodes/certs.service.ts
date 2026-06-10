import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { createHash, X509Certificate } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Signiert Agent-CSRs mit der internen Panel-CA. openssl wird mit festem
 * Binärpfad und Argument-Array aufgerufen (kein Shell-Interpreter).
 */
@Injectable()
export class CertsService {
  private readonly caCertPath = process.env.VCP_CA_CERT ?? '/certs/ca.crt';
  private readonly caKeyPath = process.env.VCP_CA_KEY ?? '/certs/ca.key';

  async signCsr(csrPem: string): Promise<{ certPem: string; caPem: string; spkiPin: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'vcp-csr-'));
    try {
      const csrPath = join(dir, 'agent.csr');
      const certPath = join(dir, 'agent.crt');
      const extPath = join(dir, 'ext.cnf');
      await writeFile(csrPath, csrPem);
      await writeFile(extPath, 'extendedKeyUsage=serverAuth,clientAuth\n');
      await execFileAsync('/usr/bin/openssl', [
        'x509', '-req', '-in', csrPath,
        '-CA', this.caCertPath, '-CAkey', this.caKeyPath, '-CAcreateserial',
        '-days', '365', '-sha256', '-extfile', extPath, '-out', certPath,
      ]);
      const certPem = await readFile(certPath, 'utf8');
      const caPem = await readFile(this.caCertPath, 'utf8');
      const cert = new X509Certificate(certPem);
      const spkiPin = createHash('sha256')
        .update(cert.publicKey.export({ type: 'spki', format: 'der' }))
        .digest('base64');
      return { certPem, caPem, spkiPin };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
