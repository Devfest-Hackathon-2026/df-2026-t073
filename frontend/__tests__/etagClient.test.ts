declare const global: any;

import { clearEtagCache, request } from '../src/api/client';

describe('ETag and 304 handling in request()', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearEtagCache();
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('stores ETag on 200 response and sends If-None-Match on subsequent GET', async () => {
    const mockFetch = jest
      .fn()
      // First call: 200 OK with ETag
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'etag' ? '"v1-hash"' : null),
        },
        json: async () => ({ hello: 'world' }),
      })
      // Second call: 304 Not Modified
      .mockResolvedValueOnce({
        ok: false,
        status: 304,
        headers: {
          get: () => null,
        },
      });

    global.fetch = mockFetch;

    // 1st request
    const firstRes = await request<{ hello: string }>('/today');
    expect(firstRes).toEqual({ hello: 'world' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1].headers['If-None-Match']).toBeUndefined();

    // 2nd request - should include If-None-Match and resolve with cached data on 304
    const secondRes = await request<{ hello: string }>('/today');
    expect(secondRes).toEqual({ hello: 'world' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1].headers['If-None-Match']).toBe('"v1-hash"');
  });

  it('clears ETag cache when clearEtagCache() is called', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'etag' ? '"v2-hash"' : null),
        },
        json: async () => ({ count: 42 }),
      });

    global.fetch = mockFetch;

    await request<{ count: number }>('/stats');
    expect(mockFetch.mock.calls[0][1].headers['If-None-Match']).toBeUndefined();

    clearEtagCache();

    await request<{ count: number }>('/stats');
    expect(mockFetch.mock.calls[1][1].headers['If-None-Match']).toBeUndefined();
  });
});

