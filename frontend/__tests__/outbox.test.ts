declare const global: any;

import {
  clearOutbox,
  drainOutbox,
  enqueueMutation,
  getOutbox,
  removeOutboxEntry,
} from '../src/cache/outbox';

describe('outbox mutation queue', () => {
  beforeEach(async () => {
    await clearOutbox();
  });

  it('enqueues mutations into persistent storage', async () => {
    const entry = await enqueueMutation({
      path: '/api/v1/review/session/s1/answers',
      method: 'POST',
      body: { rating: 'good' },
    });

    expect(entry.id).toMatch(/^mut_/);
    expect(entry.path).toBe('/api/v1/review/session/s1/answers');

    const outbox = await getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].id).toBe(entry.id);
  });

  it('drains mutations in FIFO order upon success', async () => {
    await enqueueMutation({ path: '/item1', method: 'POST' });
    await enqueueMutation({ path: '/item2', method: 'POST' });

    const executedPaths: string[] = [];
    const executor = jest.fn(async entry => {
      executedPaths.push(entry.path);
      return { ok: true };
    });

    const result = await drainOutbox(executor);

    expect(result.processed).toBe(2);
    expect(result.remaining).toBe(0);
    expect(executedPaths).toEqual(['/item1', '/item2']);
    expect(await getOutbox()).toHaveLength(0);
  });

  it('halts draining when a network error occurs, preserving remaining queue for retry', async () => {
    await enqueueMutation({ path: '/item1', method: 'POST' });
    await enqueueMutation({ path: '/item2', method: 'POST' });

    const executor = jest.fn(async entry => {
      if (entry.path === '/item1') {
        throw new Error('Network request failed');
      }
      return { ok: true };
    });

    const result = await drainOutbox(executor);

    expect(result.processed).toBe(0);
    expect(result.remaining).toBe(2);
    // Queue is preserved
    const remaining = await getOutbox();
    expect(remaining).toHaveLength(2);
    expect(remaining[0].path).toBe('/item1');
  });

  it('drops malformed or non-network errors so the queue does not stay blocked', async () => {
    await enqueueMutation({ path: '/bad_item', method: 'POST' });
    await enqueueMutation({ path: '/good_item', method: 'POST' });

    const executor = jest.fn(async entry => {
      if (entry.path === '/bad_item') {
        throw new Error('404 Not Found');
      }
      return { ok: true };
    });

    const result = await drainOutbox(executor);

    expect(result.processed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(await getOutbox()).toHaveLength(0);
  });

  it('removes specific entries and clears outbox', async () => {
    const e1 = await enqueueMutation({ path: '/1', method: 'POST' });
    const e2 = await enqueueMutation({ path: '/2', method: 'POST' });

    await removeOutboxEntry(e1.id);
    const afterRemove = await getOutbox();
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0].id).toBe(e2.id);

    await clearOutbox();
    expect(await getOutbox()).toHaveLength(0);
  });

  it('enqueues to outbox when request fails with a network error and outboxFallback is provided', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('Network request failed'));

    const { request } = require('../src/api/client');

    const result = await request('/api/v1/test/mutation', {
      method: 'POST',
      body: { count: 42 },
      outboxFallback: { status: 'offline_queued' },
    });

    expect(result).toEqual({ status: 'offline_queued' });

    const outbox = await getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].path).toBe('/api/v1/test/mutation');
    expect(outbox[0].body).toEqual({ count: 42 });

    global.fetch = originalFetch;
  });

  const failWith = (status: number) =>
    Object.assign(new Error(`HTTP ${status}`), { status });

  it('keeps a change that failed because sign-in expired, to retry later', async () => {
    await enqueueMutation({ path: '/item1', method: 'POST' });
    await enqueueMutation({ path: '/item2', method: 'POST' });
    const executor = jest.fn(async () => {
      throw failWith(401);
    });

    const result = await drainOutbox(executor);

    // Stops at the first one so the order is kept.
    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.remaining).toBe(2);
    const queue = await getOutbox();
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].lastError).toBe('HTTP 401');
  });

  it('drops a change the server rejects as bad', async () => {
    await enqueueMutation({ path: '/item1', method: 'POST' });
    await drainOutbox(async () => {
      throw failWith(400);
    });
    expect(await getOutbox()).toHaveLength(0);
  });

  it('drops a change after it keeps failing', async () => {
    await enqueueMutation({ path: '/item1', method: 'POST' });
    for (let i = 0; i < 5; i++) {
      await drainOutbox(async () => {
        throw failWith(503);
      });
    }
    expect(await getOutbox()).toHaveLength(0);
  });
});
