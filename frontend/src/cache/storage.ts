import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CacheEntry<T> {
  data: T;
  savedAt: number; // Date.now() timestamp
  ttlMs?: number;  // Optional TTL in ms
  etag?: string;
}

const CACHE_PREFIX = '@tankengo:cache:';
const INDEX_KEY = '@tankengo:cache_index';

// In-memory L1 cache for synchronous 0ms lookups during an active session
const memoryCache = new Map<string, CacheEntry<unknown>>();

/**
 * Checks whether a cache entry has exceeded its TTL.
 */
export function isCacheExpired<T>(entry: CacheEntry<T>): boolean {
  if (entry.ttlMs === undefined || entry.ttlMs <= 0) {
    return false;
  }
  return Date.now() - entry.savedAt > entry.ttlMs;
}

/**
 * Internal helper to track created cache keys so we can clear only cache items
 * without wiping user settings or auth sessions.
 */
async function recordKey(key: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const keys: string[] = raw ? JSON.parse(raw) : [];
    if (!keys.includes(key)) {
      keys.push(key);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(keys));
    }
  } catch {
    // Non-critical: failure to record key shouldn't crash the app
  }
}

/**
 * Retrieve cached data by key.
 * Checks L1 in-memory cache first for instant synchronous read, then falls back to AsyncStorage.
 */
export async function getCache<T>(key: string): Promise<CacheEntry<T> | null> {
  const fullKey = `${CACHE_PREFIX}${key}`;

  // 1. L1 Memory cache check
  if (memoryCache.has(fullKey)) {
    return memoryCache.get(fullKey) as CacheEntry<T>;
  }

  // 2. L2 AsyncStorage check
  try {
    const raw = await AsyncStorage.getItem(fullKey);
    if (!raw) {
      return null;
    }
    const entry = JSON.parse(raw) as CacheEntry<T>;
    // Populate L1 cache for subsequent fast reads
    memoryCache.set(fullKey, entry);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Synchronous get for immediate L1 memory cache read.
 */
export function getMemoryCache<T>(key: string): CacheEntry<T> | null {
  const fullKey = `${CACHE_PREFIX}${key}`;
  return (memoryCache.get(fullKey) as CacheEntry<T>) ?? null;
}

/**
 * Save data into in-device cache (both L1 memory and L2 persistent storage).
 */
export async function setCache<T>(
  key: string,
  data: T,
  ttlMs?: number,
  etag?: string,
): Promise<void> {
  const fullKey = `${CACHE_PREFIX}${key}`;
  const entry: CacheEntry<T> = {
    data,
    savedAt: Date.now(),
    ttlMs,
    etag,
  };

  // Update L1 memory cache
  memoryCache.set(fullKey, entry);

  // Update L2 persistent storage
  try {
    await AsyncStorage.setItem(fullKey, JSON.stringify(entry));
    await recordKey(fullKey);
  } catch {
    // Storage write failure (e.g. quota exceeded): in-memory cache remains active
  }
}

/**
 * Remove a specific key from cache.
 */
export async function removeCache(key: string): Promise<void> {
  const fullKey = `${CACHE_PREFIX}${key}`;
  memoryCache.delete(fullKey);
  try {
    await AsyncStorage.removeItem(fullKey);
  } catch {
    // Non-fatal
  }
}

/**
 * Clear cached API entries (optionally filtered by key prefix),
 * safely preserving user settings and auth tokens.
 */
export async function clearCache(prefix?: string): Promise<void> {
  // Clear memory cache
  if (prefix) {
    const fullPrefix = `${CACHE_PREFIX}${prefix}`;
    for (const k of memoryCache.keys()) {
      if (k.startsWith(fullPrefix)) {
        memoryCache.delete(k);
      }
    }
  } else {
    memoryCache.clear();
  }

  // Clear persistent cache
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) {
      return;
    }
    const keys: string[] = JSON.parse(raw);
    const toDelete: string[] = [];
    const remaining: string[] = [];

    const fullPrefix = prefix ? `${CACHE_PREFIX}${prefix}` : null;

    for (const k of keys) {
      if (!fullPrefix || k.startsWith(fullPrefix)) {
        toDelete.push(k);
      } else {
        remaining.push(k);
      }
    }

    await Promise.all(toDelete.map(k => AsyncStorage.removeItem(k)));
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(remaining));
  } catch {
    // Non-fatal
  }
}

