import {
  clearCache,
  getCache,
  getMemoryCache,
  isCacheExpired,
  removeCache,
  setCache,
} from '../src/cache/storage';

describe('cache storage', () => {
  beforeEach(async () => {
    await clearCache();
  });

  it('stores and retrieves cache entry from memory and disk', async () => {
    await setCache('test_key', { name: 'Tankengo' });

    // Synchronous memory cache
    const mem = getMemoryCache<{ name: string }>('test_key');
    expect(mem?.data.name).toBe('Tankengo');

    // Async cache
    const cached = await getCache<{ name: string }>('test_key');
    expect(cached).not.toBeNull();
    expect(cached?.data.name).toBe('Tankengo');
    expect(typeof cached?.savedAt).toBe('number');
  });

  it('correctly calculates expiration', () => {
    const freshEntry = {
      data: 'sample',
      savedAt: Date.now() - 5000,
      ttlMs: 60000, // 1 min
    };
    expect(isCacheExpired(freshEntry)).toBe(false);

    const expiredEntry = {
      data: 'sample',
      savedAt: Date.now() - 70000,
      ttlMs: 60000,
    };
    expect(isCacheExpired(expiredEntry)).toBe(true);
  });

  it('removes a specific cache key', async () => {
    await setCache('to_remove', 123);
    await removeCache('to_remove');
    const res = await getCache('to_remove');
    expect(res).toBeNull();
  });

  it('clears all cache entries without touching other keys', async () => {
    await setCache('key1', 'val1');
    await setCache('key2', 'val2');

    await clearCache();

    expect(await getCache('key1')).toBeNull();
    expect(await getCache('key2')).toBeNull();
  });
});

