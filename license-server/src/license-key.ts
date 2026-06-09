/**
 * License-Key-Format: VCP-XXXX-XXXX-XXXX-XXXX
 *
 * - Präfix VCP identifiziert das Produkt
 * - 4 Gruppen à 4 alphanumerische Zeichen (Großbuchstaben + Ziffern, ohne O/0/I/1/L)
 * - Checksum: letztes Zeichen der 4. Gruppe ist eine einfache mod-31-Prüfziffer
 * - Gesamtentropie: ~83 Bit (3 Gruppen à 4 Zeichen aus 31-Zeichensatz + 3 Prüfzeichen)
 *
 * Das Format ist bewusst human-readable (kann per Telefon/E-Mail übertragen werden).
 */

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 Zeichen, kein O/0/I/1/L
const MOD = CHARSET.length;

function randomChar(): string {
  const idx = Math.floor(Math.random() * MOD);
  return CHARSET[idx];
}

function group(n = 4): string {
  return Array.from({ length: n }, randomChar).join('');
}

function checksumChar(groups: string[]): string {
  const flat = groups.join('');
  let sum = 0;
  for (const c of flat) {
    sum += CHARSET.indexOf(c);
  }
  return CHARSET[sum % MOD];
}

export function generateLicenseKey(): string {
  const g1 = group();
  const g2 = group();
  const g3 = group();
  const base = group(3);
  const check = checksumChar([g1, g2, g3, base]);
  return `VCP-${g1}-${g2}-${g3}-${base}${check}`;
}

export function validateKeyFormat(key: string): boolean {
  const match = key.match(/^VCP-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/);
  if (!match) return false;
  const [, g1, g2, g3, g4] = match;
  const base = g4.slice(0, 3);
  const providedCheck = g4[3];
  const expectedCheck = checksumChar([g1, g2, g3, base]);
  return providedCheck === expectedCheck;
}

export function normalizeKey(key: string): string {
  return key.trim().toUpperCase().replace(/\s+/g, '');
}
