import {
  API_BASE_URL as RAW_API_BASE_URL,
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  LIVE_APIS as RAW_LIVE_APIS,
  USE_MOCKS as RAW_USE_MOCKS,
} from '@env';

/** Mock data is the default; set USE_MOCKS=false in frontend/.env to call the backend. */
export const USE_MOCKS = RAW_USE_MOCKS !== 'false';

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
export const LIVE_APIS: ReadonlySet<string> = new Set(
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
