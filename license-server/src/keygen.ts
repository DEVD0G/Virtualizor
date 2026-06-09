/**
 * Key-Generierung für initiales Setup und Key-Rotation.
 * Ausführen: npx tsx src/keygen.ts
 *
 * Gibt aus:
 *   - Ed25519 Private Key (PKCS#8 DER, base64) → LICENSE_PRIVATE_KEY env
 *   - Ed25519 Public Key (raw 32B, base64)      → LICENSE_PUBLIC_KEY env (im Panel einbetten)
 */

import { generateKeyPairSync } from 'crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
const publicDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
const publicRaw = publicDer.slice(12); // Strip 12-Byte SPKI-ASN.1-Header

console.log('\n=== VCP License Server — Key-Pair generiert ===\n');
console.log('PRIVATE KEY (base64) — LICENSE_PRIVATE_KEY env:');
console.log('GEHEIM HALTEN — NUR auf dem License-Server deployen\n');
console.log(privateDer.toString('base64'));
console.log('\nPUBLIC KEY (base64, raw 32 Byte) — LICENSE_PUBLIC_KEY env:');
console.log('Im Panel als Konfiguration einbetten (nicht geheim, aber nicht ersetzen ohne Key-Rotation)\n');
console.log(publicRaw.toString('base64'));
console.log('\n================================================\n');
