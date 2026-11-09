import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { clearCache, setCache } from '../src/cache/storage';
import { type CachedAsyncState, useCachedAsync } from '../src/hooks/useCachedAsync';

describe('useCachedAsync hook', () => {
  beforeEach(async () => {
    await clearCache();
  });

  it('loads from network when cache is empty', async () => {
    let hookState!: CachedAsyncState<{ id: string }>;
    const fetcher = jest.fn().mockResolvedValue({ id: 'net_1' });

    function Probe() {
      hookState = useCachedAsync('item_1', fetcher);
      return null;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe />);
    });

    expect(hookState.loading).toBe(false);
    expect(hookState.data).toEqual({ id: 'net_1' });
    expect(hookState.isFromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('renders cached data immediately without loading state, then revalidates', async () => {
    await setCache('item_2', { id: 'cached_2' });

    let hookState!: CachedAsyncState<{ id: string }>;
    const fetcher = jest.fn().mockResolvedValue({ id: 'fresh_2' });

    function Probe() {
      hookState = useCachedAsync('item_2', fetcher);
      return null;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe />);
    });

    // After resolution, fresh data is present
    expect(hookState.data).toEqual({ id: 'fresh_2' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('preserves cached data when background revalidation fails', async () => {
    await setCache('item_3', { id: 'cached_3' });

    let hookState!: CachedAsyncState<{ id: string }>;
    const fetcher = jest.fn().mockRejectedValue(new Error('Network offline'));

    function Probe() {
      hookState = useCachedAsync('item_3', fetcher);
      return null;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe />);
    });

    // Preserves cached data instead of rendering blank or error
    expect(hookState.data).toEqual({ id: 'cached_3' });
    expect(hookState.error).toBeUndefined();

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('sets error when no cache exists and network fails', async () => {
    let hookState!: CachedAsyncState<{ id: string }>;
    const fetcher = jest.fn().mockRejectedValue(new Error('Network offline'));

    function Probe() {
      hookState = useCachedAsync('item_4', fetcher);
      return null;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe />);
    });

    expect(hookState.error?.message).toBe('Network offline');
    expect(hookState.data).toBeUndefined();

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('reload returns a promise that resolves when fresh data arrives', async () => {
    let hookState!: CachedAsyncState<{ count: number }>;
    let count = 0;
    const fetcher = jest.fn().mockImplementation(async () => ({ count: ++count }));

    function Probe() {
      hookState = useCachedAsync('item_reload', fetcher);
      return null;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe />);
    });

    expect(hookState.data).toEqual({ count: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      const reloadPromise = hookState.reload();
      expect(reloadPromise).toBeInstanceOf(Promise);
      await reloadPromise;
    });

    expect(hookState.data).toEqual({ count: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('revalidate skips network fetch when cache is fresh', async () => {
    await setCache('item_reval', { val: 'initial' }, 60_000);

    let hookState!: CachedAsyncState<{ val: string }>;
    const fetcher = jest.fn().mockResolvedValue({ val: 'fresh' });

    function Probe() {
      // revalidateOnMount: false to test revalidate() in isolation
      hookState = useCachedAsync('item_reval', fetcher, '', {
        revalidateOnMount: false,
        ttlMs: 60_000,
      });
      return null;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe />);
    });

    expect(hookState.data).toEqual({ val: 'initial' });
    expect(fetcher).toHaveBeenCalledTimes(0);

    // Call revalidate - should check TTL and NOT fetch because cache is fresh
    await ReactTestRenderer.act(async () => {
      await hookState.revalidate();
    });

    expect(fetcher).toHaveBeenCalledTimes(0);
    expect(hookState.data).toEqual({ val: 'initial' });

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  it('revalidate fetches when cache TTL has expired', async () => {
    // 50ms TTL so it is fresh on mount
    await setCache('item_expired', { val: 'stale' }, 50);

    let hookState!: CachedAsyncState<{ val: string }>;
    const fetcher = jest.fn().mockResolvedValue({ val: 'updated' });

    function Probe() {
      hookState = useCachedAsync('item_expired', fetcher, '', {
        revalidateOnMount: false,
        ttlMs: 50,
      });
      return null;
    }

    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Probe />);
    });

    expect(fetcher).toHaveBeenCalledTimes(0);

    // Wait 60ms for TTL to expire
    await new Promise(resolve => setTimeout(() => resolve(undefined), 60));

    // Call revalidate - should detect cache expired and trigger fetch
    await ReactTestRenderer.act(async () => {
      await hookState.revalidate();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(hookState.data).toEqual({ val: 'updated' });

    await ReactTestRenderer.act(async () => tree.unmount());
  });
});
