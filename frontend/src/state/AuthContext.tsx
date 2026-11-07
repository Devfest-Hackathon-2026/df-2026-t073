import type { User } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ensureSignedIn, firebaseConfigured, watchUser } from '../auth/firebase';

export type AuthStatus = 'not_configured' | 'signing_in' | 'signed_in' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Signs in anonymously on launch. The app never waits on this: mock data works signed out. */
export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stop = watchUser(setUser);
    ensureSignedIn().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    return stop;
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    let status: AuthStatus = 'signing_in';
    if (!firebaseConfigured) {
      status = 'not_configured';
    } else if (user) {
      status = 'signed_in';
    } else if (error) {
      status = 'error';
    }
    return { status, user, error };
  }, [user, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
