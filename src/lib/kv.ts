/**
 * Upstash Redis wrapper for persistent KV caching.
 * Gracefully no-ops when env vars are missing (local dev without Redis).
 */

import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  // Standard Upstash env vars (auto-set by Vercel Marketplace integration)
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedis();
    if (!client) return null;
    return await client.get<T>(key);
  } catch {
    return null;
  }
}

/**
 * Write a value to KV.
 *
 * `ttlSeconds` bounds how long a stale or bad value can survive. Pass a
 * positive number of seconds; omit it (or pass a non-positive value) only
 * when the key is genuinely meant to persist until explicitly deleted.
 */
export async function kvSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await client.set(key, value, { ex: Math.floor(ttlSeconds) });
    } else {
      await client.set(key, value);
    }
  } catch {
    // KV is never a hard dependency — swallow errors
  }
}

export async function kvDel(key: string): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    await client.del(key);
  } catch {
    // KV is never a hard dependency — swallow errors
  }
}
