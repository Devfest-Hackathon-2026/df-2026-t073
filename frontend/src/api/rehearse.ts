import { resultFor, scriptFor } from '../mocks/rehearse';
import type { RehearsalResult, RehearsalScript } from '../types';
import { API_V1, mockDelay, pick, request } from './client';

/** Starts a role-play. The real version streams turns; the mock returns a fixed script. */
export const startRehearsal = pick(
  'rehearse',
  (placeId: string, _speed: 'slower' | 'natural') => {
    return mockDelay<RehearsalScript>(scriptFor(placeId));
  },
  // TODO confirm endpoint with backend
  (placeId: string, speed: 'slower' | 'natural') =>
    request<RehearsalScript>(`${API_V1}/rehearsals`, {
      method: 'POST',
      body: { placeId, speed },
    }),
);

export const getRehearsalResult = pick(
  'rehearse',
  (placeId: string) => mockDelay<RehearsalResult>(resultFor(placeId), 600),
  // TODO confirm endpoint with backend. Real version is keyed by rehearsal id.
  (placeId: string) =>
    request<RehearsalResult>(`${API_V1}/rehearsals/latest/results`, {
      query: { placeId },
    }),
);
