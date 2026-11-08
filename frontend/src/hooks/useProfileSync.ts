import { useEffect } from 'react';
import { getProfile, updateProfile } from '../api/user';
import { useAuth } from '../state/AuthContext';
import { useSettings } from '../state/SettingsContext';

/**
 * Keeps the backend profile's reading level in step with the app's setting
 * (the word of the day and Me's level note use the backend copy). One
 * profile read per app start, a write only when they differ.
 */
export function useProfileSync(): void {
  const { settings, ready } = useSettings();
  const { status } = useAuth();
  const { onboarded, readingLevel } = settings;
  const signedIn = status === 'signed_in' || status === 'not_configured';

  useEffect(() => {
    if (!ready || !onboarded || !signedIn) {
      return;
    }
    let alive = true;
    getProfile()
      .then(profile => {
        if (alive && profile.readingLevel !== readingLevel) {
          return updateProfile({ readingLevel });
        }
      })
      .catch(() => {
        // Offline or signed out: the next start tries again.
      });
    return () => {
      alive = false;
    };
  }, [ready, onboarded, signedIn, readingLevel]);
}
