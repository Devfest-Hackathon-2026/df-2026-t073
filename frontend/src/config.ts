import {
  API_BASE_URL as RAW_API_BASE_URL,
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  LIVE_APIS as RAW_LIVE_APIS,
  TEST_USER_EMAIL as RAW_TEST_USER_EMAIL,
  TEST_USER_PASSWORD as RAW_TEST_USER_PASSWORD,
  USE_MOCKS as RAW_USE_MOCKS,
} from '@env';

const IS_TEST =
  typeof process !== 'undefined' &&
  (process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID));

/** Mock data is the default; set USE_MOCKS=false in frontend/.env to call the backend. In tests, always mock. */
export const USE_MOCKS = IS_TEST ? true : RAW_USE_MOCKS !== 'false';

/** Optional test user credentials: keeps the same UID across app launches & devices. */
export const TEST_USER_EMAIL = (RAW_TEST_USER_EMAIL ?? '').trim();
export const TEST_USER_PASSWORD = (RAW_TEST_USER_PASSWORD ?? '').trim();

export type ApiArea =
  | 'places'
  | 'prepare'
  | 'rehearse'
  | 'capture'
  | 'tango'
  | 'review'
  | 'user';

/**
 * Areas that call the backend even while USE_MOCKS is on, e.g.
 * LIVE_APIS=capture,tango. Lets one feature go live before the rest exists.
 */
export const LIVE_APIS: ReadonlySet<string> = IS_TEST
  ? new Set()
  : new Set(
      (RAW_LIVE_APIS ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    );

/** True when this area should call the backend instead of mock data. */
export function isLive(area: ApiArea): boolean {
  return !USE_MOCKS || LIVE_APIS.has(area);
}

/** 10.0.2.2 reaches the host machine from the Android emulator. */
export const API_BASE_URL = (
  RAW_API_BASE_URL || 'http://10.0.2.2:8000'
).replace(/\/$/, '');

/** Firebase web app config (Firebase console › Project settings › Your apps). */
export const FIREBASE_CONFIG = {
  apiKey: FIREBASE_API_KEY ?? '',
  authDomain:
    FIREBASE_AUTH_DOMAIN ||
    (FIREBASE_PROJECT_ID ? `${FIREBASE_PROJECT_ID}.firebaseapp.com` : ''),
  projectId: FIREBASE_PROJECT_ID ?? '',
  appId: FIREBASE_APP_ID ?? '',
};
