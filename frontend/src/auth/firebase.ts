import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  createUserWithEmailAndPassword,
  getReactNativePersistence,
  GoogleAuthProvider,
  initializeAuth,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  FIREBASE_CONFIG,
  GOOGLE_WEB_CLIENT_ID,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from '../config';
import { copy } from '../copy';

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
    throw new Error(copy.errors.authNotConfigured);
  }
  const cleanEmail = email.trim();
  const cleanPass = password.trim();
  if (!cleanEmail || !cleanPass) {
    throw new Error(copy.errors.emailPasswordRequired);
  }
  await instance.authStateReady();
  const cred = await signInWithEmailAndPassword(
    instance,
    cleanEmail,
    cleanPass,
  );
  return cred.user;
}

/** Creates a new user with email and password. */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const instance = getAuthInstance();
  if (!instance) {
    throw new Error(copy.errors.authNotConfigured);
  }
  const cleanEmail = email.trim();
  const cleanPass = password.trim();
  if (!cleanEmail || !cleanPass) {
    throw new Error(copy.errors.emailPasswordRequired);
  }
  await instance.authStateReady();
  const cred = await createUserWithEmailAndPassword(
    instance,
    cleanEmail,
    cleanPass,
  );
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
    throw new Error(copy.errors.testEmailPasswordRequired);
  }
  await instance.authStateReady();

  // If already signed in as this exact user, return it
  if (instance.currentUser && instance.currentUser.email === cleanEmail) {
    return instance.currentUser;
  }

  try {
    const cred = await signInWithEmailAndPassword(
      instance,
      cleanEmail,
      cleanPass,
    );
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
          throw new Error(copy.errors.wrongPasswordForExistingUser);
        }
        if (createCode === 'auth/operation-not-allowed') {
          throw new Error(copy.errors.emailSignInDisabled);
        }
        throw createErr;
      }
    }
    if (code === 'auth/operation-not-allowed') {
      throw new Error(copy.errors.emailSignInDisabled);
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

let googleConfigured = false;

/** Sets up the Google sign-in library once, if the Web client ID is set. */
function configureGoogle(): boolean {
  if (!GOOGLE_WEB_CLIENT_ID) {
    return false;
  }
  if (!googleConfigured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    googleConfigured = true;
  }
  return true;
}

/**
 * Signs in with a Google account. The Firebase JS SDK has no popup flow on
 * React Native, so the native Google dialog gives an ID token and Firebase
 * exchanges it for a session. Returns null if the person closes the dialog.
 *
 * An anonymous session is linked instead of replaced, so its data stays.
 */
export async function signInWithGoogle(): Promise<User | null> {
  const instance = getAuthInstance();
  if (!instance) {
    throw new Error(copy.errors.authNotConfigured);
  }
  if (!configureGoogle()) {
    throw new Error(copy.errors.googleNotConfigured);
  }
  await instance.authStateReady();

  let idToken: string | null | undefined;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return null; // closed the dialog
    }
    idToken = response.data.idToken;
  } catch (err: unknown) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        return null;
      }
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error(copy.login.googlePlayServices);
      }
    }
    throw err;
  }
  if (!idToken) {
    throw new Error(copy.errors.googleNoToken);
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const current = instance.currentUser;
  if (current?.isAnonymous) {
    try {
      const linked = await linkWithCredential(current, credential);
      return linked.user;
    } catch (err: unknown) {
      // This Google account already has its own Firebase user: sign in to it.
      // The anonymous account's data stays behind under the old user.
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/credential-already-in-use') {
        throw err;
      }
    }
  }
  const result = await signInWithCredential(instance, credential);
  return result.user;
}

/** Signs out the current user session and removes persisted auth. */
export async function signOutUser(): Promise<void> {
  const instance = getAuthInstance();
  if (!instance) {
    return;
  }
  try {
    if (configureGoogle()) {
      // So the account picker shows again next time.
      await GoogleSignin.signOut();
    }
  } catch {
    // Google sign-in isn't set up or isn't in this build; logging out of
    // Firebase must still work.
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
