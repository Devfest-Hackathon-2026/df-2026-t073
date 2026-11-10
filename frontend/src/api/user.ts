import { clearOutbox } from '../cache/outbox';
import { clearCache } from '../cache/storage';
import { PROFILE } from '../mocks/user';
import type { ProfileUpdate, ReadingLevel, UserProfile } from '../types';
import { API_V1, mockDelay, pick, request } from './client';

/** Backend shape (backend/app/schemas/user.py). */
interface ProfileResponse {
  uid: string;
  name: string;
  reading_level: ReadingLevel | null;
  home_area: {
    label: string;
    lat: number;
    lng: number;
    radius_m: number;
  } | null;
  stats: { tango: number; stars: number; places: number };
}

function toProfile(r: ProfileResponse): UserProfile {
  return {
    name: r.name,
    readingLevel: r.reading_level,
    homeArea: r.home_area
      ? {
          label: r.home_area.label,
          lat: r.home_area.lat,
          lng: r.home_area.lng,
          radiusM: r.home_area.radius_m,
        }
      : null,
    stats: r.stats,
  };
}

/** Profile and counts for the Me tab. */
export const getProfile = pick(
  'user',
  () => mockDelay<UserProfile>(PROFILE),
  async () => toProfile(await request<ProfileResponse>(`${API_V1}/me/profile`)),
);

/** Saves name, reading level or home area. Fields left out stay as they are. */
export const updateProfile = pick(
  'user',
  (patch: ProfileUpdate) =>
    mockDelay<UserProfile>({
      ...PROFILE,
      ...(patch.name ? { name: patch.name } : {}),
    }),
  async (patch: ProfileUpdate) => {
    const profile = toProfile(
      await request<ProfileResponse>(`${API_V1}/me/profile`, {
        method: 'PUT',
        body: {
          name: patch.name,
          reading_level: patch.readingLevel,
          home_area: patch.homeArea
            ? {
                label: patch.homeArea.label,
                lat: patch.homeArea.lat,
                lng: patch.homeArea.lng,
                radius_m: patch.homeArea.radiusM,
              }
            : undefined,
        },
      }),
    );
    // The Me tab and Home's greeting show the profile.
    await Promise.all([clearCache('user:'), clearCache('today:')]);
    return profile;
  },
);

/**
 * Permanently deletes the account and everything in it (server side), then
 * clears what this device saved. Mock mode only clears the device.
 */
export const deleteAccount = pick(
  'user',
  async () => {
    await mockDelay(undefined);
    await clearDeviceData();
  },
  async () => {
    await request<void>(`${API_V1}/me`, { method: 'DELETE' });
    await clearDeviceData();
  },
);

async function clearDeviceData(): Promise<void> {
  await Promise.all([clearCache(), clearOutbox()]);
}
