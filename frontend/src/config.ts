import {
  API_BASE_URL as RAW_API_BASE_URL,
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID,
  USE_MOCKS as RAW_USE_MOCKS,
} from '@env';

/** Mock data is the default; set USE_MOCKS=false in frontend/.env to call the backend. */
export const USE_MOCKS = RAW_USE_MOCKS !== 'false';

/** 10.0.2.2 reaches the host machine from the Android emulator. */
export const API_BASE_URL = (RAW_API_BASE_URL || 'http://10.0.2.2:8000').replace(
  /\/$/,
  '',
);

/** Firebase web app config (Firebase console › Project settings › Your apps). */
export const FIREBASE_CONFIG = {
  apiKey: FIREBASE_API_KEY ?? '',
  authDomain: FIREBASE_AUTH_DOMAIN || (FIREBASE_PROJECT_ID ? `${FIREBASE_PROJECT_ID}.firebaseapp.com` : ''),
  projectId: FIREBASE_PROJECT_ID ?? '',
  appId: FIREBASE_APP_ID ?? '',
};
