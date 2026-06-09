/**
 * Einfaches Sliding-Window Rate-Limiting.
 * Produnktionsempfehlung: Redis ersetzen (INCR + EXPIRE).
 * Diese Implementierung nutzt In-Memory Maps für die Referenz-Impl.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

type Endpoint = 'activate' | 'validate' | 'status';

const LIMITS: Record<Endpoint, { window: number; max: number }> = {
  activate: { window: 3600_000, max: 10 },   // 10/h pro IP
  validate: { window: 300_000, max: 5 },      // 5/5min pro IP + pro License-Key
  status:   { window: 60_000,  max: 30 },     // 30/min pro IP
};

export function checkRateLimit(
  endpoint: Endpoint,
  keys: string[],
): { allowed: boolean; retryAfterMs?: number } {
  const { window, max } = LIMITS[endpoint];
  const now = Date.now();

  for (const key of keys) {
    const bucketKey = `${endpoint}:${key}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + window };
      buckets.set(bucketKey, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }
  }
  return { allowed: true };
}

// Cleanup expired buckets periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 60_000);
