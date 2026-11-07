import { getIdToken } from '../auth/firebase';
import { API_BASE_URL, type ApiArea, isLive } from '../config';

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
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

/** JSON request against the backend. Throws ApiError on non-2xx responses. */
export async function request<T>(
  path: string,
  { method = 'GET', body, query }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  // Every /api/v1 route on the backend checks this Firebase ID token.
  const token = await getIdToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_BASE_URL}${path}${toQueryString(query)}`,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new ApiError(
      `${method} ${path} failed with HTTP ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Resolves with a copy of `value` after a short delay, like a network call. */
export function mockDelay<T>(value: T, ms = 300): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(value === undefined ? value : JSON.parse(JSON.stringify(value)));
    }, ms);
  });
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
