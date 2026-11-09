import { AppState } from 'react-native';
import { drainOutbox, enqueueMutation } from '../cache/outbox';
import { isNetworkError, setOnlineStatus } from '../cache/network';
import { getIdToken } from '../auth/firebase';
import { API_BASE_URL, type ApiArea, isLive } from '../config';
import { copy } from '../copy';

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions<T = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Optimistic fallback to return and queue into outbox if offline. */
  outboxFallback?: T;
}

function toQueryString(query?: Query): string {
  if (!query) {
    return '';
  }
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  return parts.length ? `?${parts.join('&')}` : '';
}

const REQUEST_TIMEOUT_MS = 45_000;

interface ETagCacheEntry {
  etag: string;
  data: unknown;
}

const etagCache = new Map<string, ETagCacheEntry>();

/** Clears all cached ETags and HTTP 304 response data. */
export function clearEtagCache(): void {
  etagCache.clear();
}

/** JSON request against the backend. Throws ApiError on non-2xx responses. */
export async function request<T>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  const { method = 'GET', body, query, outboxFallback } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  // Every /api/v1 route on the backend checks this Firebase ID token.
  const token = await getIdToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const fullUrl = `${API_BASE_URL}${path}${toQueryString(query)}`;
  if (method === 'GET') {
    const cached = etagCache.get(fullUrl);
    if (cached) {
      headers['If-None-Match'] = cached.etag;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      fullUrl,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (response.status === 304) {
      const cached = etagCache.get(fullUrl);
      if (cached) {
        return cached.data as T;
      }
    }

    if (!response.ok) {
      // Daily limits come with a message meant for the user; show it as-is.
      if (response.status === 429) {
        const detail = await response
          .json()
          .then((b: { detail?: unknown }) => b.detail)
          .catch(() => undefined);
        throw new ApiError(
          typeof detail === 'string'
            ? detail
            : copy.errors.dailyLimit,
          429,
        );
      }
      throw new ApiError(
        copy.errors.requestFailed(method, path, response.status),
        response.status,
      );
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const data = (await response.json()) as T;
    if (method === 'GET') {
      const etag = response.headers.get('etag') || response.headers.get('ETag');
      if (etag) {
        etagCache.set(fullUrl, { etag, data });
      }
    }
    return data;
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new ApiError(copy.errors.timedOut, 408);
    }
    if (outboxFallback !== undefined && isNetworkError(err)) {
      setOnlineStatus(false);
      if (method !== 'GET') {
        await enqueueMutation({
          path,
          method,
          body,
          query,
        });
      }
      return outboxFallback;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves with a copy of `value` after a short delay, like a network call. */
export function mockDelay<T>(value: T, ms = 300): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(value === undefined ? value : JSON.parse(JSON.stringify(value)));
    }, ms);
  });
}

/**
 * Automatically drains pending offline mutations in the background.
 */
export function flushOutbox(): Promise<{ processed: number; remaining: number }> {
  return drainOutbox(item =>
    request(item.path, {
      method: item.method,
      body: item.body,
      query: item.query,
    }),
  );
}

// Flush queued mutations whenever app returns to the foreground
AppState.addEventListener('change', status => {
  if (status === 'active') {
    flushOutbox().catch(() => {});
  }
});

/**
 * Executes a mutation with offline fallback: if network fails, enqueues to outbox
 * and returns `optimisticFallback` so the user is never blocked.
 */
export async function mutateWithOutbox<T>(
  path: string,
  options: RequestOptions<T>,
  optimisticFallback: T,
): Promise<T> {
  try {
    const res = await request<T>(path, options);
    // When a request succeeds, attempt to flush any earlier queued items
    flushOutbox().catch(() => {});
    return res;
  } catch (err: unknown) {
    if (isNetworkError(err)) {
      setOnlineStatus(false);
      const method = options.method ?? 'POST';
      if (method !== 'GET') {
        await enqueueMutation({
          path,
          method,
          body: options.body,
          query: options.query,
        });
      }
      return optimisticFallback;
    }
    throw err;
  }
}

/** Picks the mock or the fetch implementation for an area (USE_MOCKS / LIVE_APIS). */
export function pick<A extends unknown[], R>(
  area: ApiArea,
  mock: (...args: A) => Promise<R>,
  real: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return isLive(area) ? real : mock;
}

export const API_V1 = '/api/v1';
