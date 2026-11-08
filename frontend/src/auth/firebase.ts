import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  createUserWithEmailAndPassword,
  getReactNativePersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  FIREBASE_CONFIG,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from '../config';

// Firebase Authentication. Supports persistent test user credentials
// (keeps the same UID and data across runs) or anonymous sign-in.

let auth: Auth | null = null;

/** True when the Firebase values are set in frontend/.env. */
export const firebaseConfigured =
  !!FIREBASE_CONFIG.apiKey && !!FIREBASE_CONFIG.projectId;

function getAuthInstance(): Auth | null {
  if (!firebaseConfigured) {
    return null;
  }
  if (!auth) {
    const app: FirebaseApp = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
    // Keeps the session across app restarts, so the account stays the same.
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

/** Signs in with email and password. */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const instance = getAuthInstance();
  if (!instance) {
    throw new Error('Firebase Authentication is not configured.');
  }
  const cleanEmail = email.trim();
  const cleanPass = password.trim();
  if (!cleanEmail || !cleanPass) {
    throw new Error('Email and password are required.');
  }
  await instance.authStateReady();
  const cred = await signInWithEmailAndPassword(instance, cleanEmail, cleanPass);
  return cred.user;
}

/** Creates a new user with email and password. */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const instance = getAuthInstance();
  if (!instance) {
    throw new Error('Firebase Authentication is not configured.');
  }
  const cleanEmail = email.trim();
  const cleanPass = password.trim();
  if (!cleanEmail || !cleanPass) {
    throw new Error('Email and password are required.');
  }
  await instance.authStateReady();
  const cred = await createUserWithEmailAndPassword(instance, cleanEmail, cleanPass);
  return cred.user;
}

/** Signs in as test user with email and password, auto-creating the account if needed. */
export async function signInWithTestCredentials(
  email = TEST_USER_EMAIL,
  password = TEST_USER_PASSWORD,
): Promise<User | null> {
  const instance = getAuthInstance();
  if (!instance) {
    return null;
  }
  const cleanEmail = email.trim();
  const cleanPass = password.trim();
  if (!cleanEmail || !cleanPass) {
    throw new Error('Test email and password are required.');
  }
  await instance.authStateReady();

  // If already signed in as this exact user, return it
  if (instance.currentUser && instance.currentUser.email === cleanEmail) {
    return instance.currentUser;
  }

  try {
    const cred = await signInWithEmailAndPassword(instance, cleanEmail, cleanPass);
    return cred.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    // If the account does not exist yet, try creating it automatically
    if (
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-login-credentials'
    ) {
      try {
        const created = await createUserWithEmailAndPassword(
          instance,
          cleanEmail,
          cleanPass,
        );
        return created.user;
      } catch (createErr: unknown) {
        const createCode = (createErr as { code?: string })?.code;
        if (createCode === 'auth/email-already-in-use') {
          throw new Error('User exists but with a different password.');
        }
        if (createCode === 'auth/operation-not-allowed') {
          throw new Error(
            'Email/Password sign-in is disabled in Firebase Console. Enable it under Authentication > Sign-in method.',
          );
        }
        throw createErr;
      }
    }
    if (code === 'auth/operation-not-allowed') {
      throw new Error(
        'Email/Password sign-in is disabled in Firebase Console. Enable it under Authentication > Sign-in method.',
      );
    }
    throw err;
  }
}

/** Signs in anonymously (or returns existing anonymous user). */
export async function signInAnonymousUser(): Promise<User | null> {
  const instance = getAuthInstance();
  if (!instance) {
    return null;
  }
  await instance.authStateReady();
  if (instance.currentUser && instance.currentUser.isAnonymous) {
    return instance.currentUser;
  }
  const credential = await signInAnonymously(instance);
  return credential.user;
}

/** Signs out the current user session and removes persisted auth. */
export async function signOutUser(): Promise<void> {
  const instance = getAuthInstance();
  if (!instance) {
    return;
  }
  await signOut(instance);
}

/** Waits for Firebase Auth persistence to restore any existing signed-in session. */
export async function waitForAuthReady(): Promise<User | null> {
  const instance = getAuthInstance();
  if (!instance) {
    return null;
  }
  await instance.authStateReady();
  return instance.currentUser;
}

/**
 * Ensures a user is signed in on launch:
 * Reuses existing persisted session if available. If none, returns null (requiring login).
 */
export async function ensureSignedIn(): Promise<User | null> {
  const instance = getAuthInstance();
  if (!instance) {
    return null;
  }
  await instance.authStateReady();
  return instance.currentUser;
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
