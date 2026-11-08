import type { User } from 'firebase/auth';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  firebaseConfigured,
  signInAnonymousUser,
  signInWithEmail,
  signInWithTestCredentials,
  signOutUser,
  signUpWithEmail,
  waitForAuthReady,
  watchUser,
} from '../auth/firebase';

export type AuthStatus =
  | 'not_configured'
  | 'signing_in'
  | 'signed_in'
  | 'signed_out'
  | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** True once Firebase Auth has restored any persisted session from storage. */
  ready: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string) => Promise<User>;
  signInWithTest: (email?: string, password?: string) => Promise<User | null>;
  signInAnonymous: () => Promise<User | null>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Manages Firebase authentication state.
 * Restores persisted session from storage on app start, keeping the user logged in
 * across runs until an explicit signOut() is called.
 */
export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const stop = watchUser(currentUser => {
      if (alive) {
        setUser(currentUser);
      }
    });

    waitForAuthReady()
      .then(initialUser => {
        if (alive) {
          setUser(initialUser);
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (alive) {
          setReady(true);
        }
      });

    return () => {
      alive = false;
      stop();
    };
  }, []);

  const handleSignIn = useCallback(async (email: string, pass: string) => {
    setError(null);
    try {
      const u = await signInWithEmail(email, pass);
      setUser(u);
      return u;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const handleSignUp = useCallback(async (email: string, pass: string) => {
    setError(null);
    try {
      const u = await signUpWithEmail(email, pass);
      setUser(u);
      return u;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const signInWithTest = useCallback(
    async (email?: string, password?: string) => {
      setError(null);
      try {
        const u = await signInWithTestCredentials(email, password);
        setUser(u);
        return u;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const signInAnonymous = useCallback(async () => {
    setError(null);
    try {
      const u = await signInAnonymousUser();
      setUser(u);
      return u;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setError(null);
    try {
      await signOutUser();
      setUser(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    let status: AuthStatus = 'signing_in';
    if (!firebaseConfigured) {
      status = 'not_configured';
    } else if (user) {
      status = 'signed_in';
    } else if (ready) {
      status = 'signed_out';
    } else if (error) {
      status = 'error';
    }
    return {
      status,
      user,
      ready,
      error,
      signIn: handleSignIn,
      signUp: handleSignUp,
      signInWithTest,
      signInAnonymous,
      signOut: handleSignOut,
      clearError,
    };
  }, [
    user,
    ready,
    error,
    handleSignIn,
    handleSignUp,
    signInWithTest,
    signInAnonymous,
    handleSignOut,
    clearError,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
