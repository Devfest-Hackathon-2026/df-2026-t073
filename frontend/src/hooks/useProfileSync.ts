import { useEffect } from 'react';
import { getProfile, updateProfile } from '../api/user';
import { getCache, isCacheExpired, setCache } from '../cache/storage';
import { useAuth } from '../state/AuthContext';
import { useSettings } from '../state/SettingsContext';
import type { UserProfile } from '../types';

const PROFILE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Keeps the backend profile's reading level in step with the app's setting
 * (the word of the day and Me's level note use the backend copy).
 * Checks the in-device cache first so app open does not block on network.
 */
export function useProfileSync(): void {
  const { settings, ready, update } = useSettings();
  const { status } = useAuth();
  const { onboarded, readingLevel } = settings;
  const signedIn = status === 'signed_in' || status === 'not_configured';

  useEffect(() => {
    if (!ready || !onboarded || !signedIn) {
      return;
    }
    let alive = true;

    async function sync() {
      // 1. Check local cache first to avoid unneeded network roundtrip on open
      const cached = await getCache<UserProfile>('user:profile');
      if (
        cached &&
        !isCacheExpired(cached) &&
        cached.data.readingLevel === readingLevel
      ) {
        return;
      }

      try {
        const profile = await getProfile();
        if (!alive) {
          return;
        }
        await setCache('user:profile', profile, PROFILE_CACHE_TTL_MS);
        if (!cached && profile.readingLevel && profile.readingLevel !== readingLevel) {
          // Fresh device or cleared cache: adopt server's configured reading level locally
          update({ readingLevel: profile.readingLevel });
        } else if (profile.readingLevel !== readingLevel) {
          // User changed reading level on this device: persist to backend
          const updated = await updateProfile({ readingLevel });
          if (alive) {
            await setCache('user:profile', updated, PROFILE_CACHE_TTL_MS);
          }
        }
      } catch {
        // Offline or signed out: the next start tries again.
      }
    }

    sync();

    return () => {
      alive = false;
    };
  }, [ready, onboarded, signedIn, readingLevel, update]);
}
