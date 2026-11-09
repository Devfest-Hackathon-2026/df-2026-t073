// Values inlined from frontend/.env by react-native-dotenv (see babel.config.js).
declare module '@env' {
  export const USE_MOCKS: string | undefined;
  export const API_BASE_URL: string | undefined;
  export const LIVE_APIS: string | undefined;
  export const FIREBASE_API_KEY: string | undefined;
  export const FIREBASE_AUTH_DOMAIN: string | undefined;
  export const FIREBASE_PROJECT_ID: string | undefined;
  export const FIREBASE_APP_ID: string | undefined;
  export const TEST_USER_EMAIL: string | undefined;
  export const TEST_USER_PASSWORD: string | undefined;
}

declare const process: {
  env: Record<string, string | undefined>;
};

