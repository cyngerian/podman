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

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    await client.set(key, value);
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
