import { PROFILE } from '../mocks/user';
import type { UserProfile } from '../types';
import { API_V1, mockDelay, pick, request } from './client';

/**
 * Profile and counts for the Me tab.
 * The backend's existing GET /api/v1/me returns { uid, email, name, ... };
 * the stats are a TODO to agree on.
 */
export const getProfile = pick(
  () => mockDelay<UserProfile>(PROFILE),
  // TODO confirm endpoint with backend
  () => request<UserProfile>(`${API_V1}/me/profile`),
);
