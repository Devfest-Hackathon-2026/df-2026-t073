import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from 'firebase/auth';
import { FIREBASE_CONFIG } from '../config';

// Anonymous Firebase sign-in. Every user silently gets an account on first
// launch; the backend verifies its ID token on /api/v1 routes.

let auth: Auth | null = null;

/** True when the Firebase values are set in frontend/.env. */
export const firebaseConfigured =
  !!FIREBASE_CONFIG.apiKey && !!FIREBASE_CONFIG.projectId && !!FIREBASE_CONFIG.appId;

function getAuthInstance(): Auth | null {
  if (!firebaseConfigured) {
    return null;
  }
  if (!auth) {
    const app: FirebaseApp = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
    // Keeps the session across app restarts, so the anonymous account stays the same.
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
  return auth;
}

/** Calls `onChange` with the current user now and on every change. */
export function watchUser(onChange: (user: User | null) => void): () => void {
  const instance = getAuthInstance();
  if (!instance) {
    onChange(null);
    return () => {};
  }
  return onAuthStateChanged(instance, onChange);
}

/** Signs in anonymously unless someone is already signed in. */
export async function ensureSignedIn(): Promise<User | null> {
  const instance = getAuthInstance();
  if (!instance) {
    return null;
  }
  await instance.authStateReady();
  if (instance.currentUser) {
    return instance.currentUser;
  }
  const credential = await signInAnonymously(instance);
  return credential.user;
}

/** Current ID token for the Authorization header, or null when signed out. */
export async function getIdToken(): Promise<string | null> {
  const instance = getAuthInstance();
  if (!instance) {
    return null;
  }
  await instance.authStateReady();
  return instance.currentUser ? instance.currentUser.getIdToken() : null;
}
