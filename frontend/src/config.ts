import {
  API_BASE_URL as RAW_API_BASE_URL,
  USE_MOCKS as RAW_USE_MOCKS,
} from '@env';

/** Mock data is the default; set USE_MOCKS=false in frontend/.env to call the backend. */
export const USE_MOCKS = RAW_USE_MOCKS !== 'false';

/** 10.0.2.2 reaches the host machine from the Android emulator. */
export const API_BASE_URL = (RAW_API_BASE_URL || 'http://10.0.2.2:8000').replace(
  /\/$/,
  '',
);
