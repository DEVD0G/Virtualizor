/**
 * Krypto-Primitives für den License-Server.
 *
 * Signing: Ed25519. Der Private Key liegt AUSSCHLIESSLICH auf dem License-Server.
 * Der Public Key (32 Bytes, base64) wird in das Panel eingebettet (BUILD-Zeit-Config).
 *
 * Response-Format:
 *   { payload: base64(JSON), signature: base64(ed25519_sign(payload_bytes)) }
 *
 * Das Panel verifiziert die Signatur, bevor es den Payload parsed — manipulierte
 * Antworten (MITM, DB-Änderung) scheitern an der Signatur.
 */

import { createSign, createVerify } from 'crypto';

// Private Key: PKCS#8 DER, base64 (aus LICENSE_PRIVATE_KEY env)
// Public Key:  raw 32-Byte Ed25519 key, base64 (aus LICENSE_PUBLIC_KEY env)

function loadPrivateKey(): Buffer {
  const b64 = process.env.LICENSE_PRIVATE_KEY;
  if (!b64) throw new Error('LICENSE_PRIVATE_KEY ist nicht gesetzt');
  return Buffer.from(b64, 'base64');
}

function loadPublicKey(): Buffer {
  const b64 = process.env.LICENSE_PUBLIC_KEY;
  if (!b64) throw new Error('LICENSE_PUBLIC_KEY ist nicht gesetzt');
  // raw 32-Byte Ed25519 key → SPKI-DER (12-Byte Header + 32 Byte Key)
  const raw = Buffer.from(b64, 'base64');
  const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
  return Buffer.concat([spkiHeader, raw]);
}

export function signPayload(payload: object): { payload: string; signature: string } {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const payloadBytes = Buffer.from(payloadB64, 'base64');
  const sign = createSign('Ed25519');
  sign.update(payloadBytes);
  const signature = sign.sign({
    key: loadPrivateKey(),
    format: 'der',
    type: 'pkcs8',
  }).toString('base64');
  return { payload: payloadB64, signature };
}

export function verifySignedResponse(payloadB64: string, signatureB64: string): boolean {
  try {
    const verify = createVerify('Ed25519');
    verify.update(Buffer.from(payloadB64, 'base64'));
    return verify.verify(
      { key: loadPublicKey(), format: 'der', type: 'spki' },
      Buffer.from(signatureB64, 'base64'),
    );
  } catch {
    return false;
  }
}

/** Generiert einen neuen Ed25519-Key-Pair (für initiales Setup / Key-Rotation). */
export function generateKeyPair(): { privateKeyB64: string; publicKeyRawB64: string } {
  const { generateKeyPairSync } = await import('crypto') as any;
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateDer = (privateKey as any).export({ type: 'pkcs8', format: 'der' }) as Buffer;
  const publicDer = (publicKey as any).export({ type: 'spki', format: 'der' }) as Buffer;
  const publicRaw = publicDer.slice(12); // Strip 12-Byte SPKI Header
  return {
    privateKeyB64: privateDer.toString('base64'),
    publicKeyRawB64: publicRaw.toString('base64'),
  };
}
