import { briefingFor } from '../mocks/prepare';
import type { PrepareBriefing } from '../types';
import { API_V1, mockDelay, pick, request } from './client';

/** Visit briefing: what to expect, Tango for the visit, anonymous tips. */
export const getBriefing = pick(
  'prepare',
  (placeId: string) => mockDelay<PrepareBriefing>(briefingFor(placeId), 500),
  // TODO confirm endpoint with backend (Gemini + Google Maps grounding)
  (placeId: string) =>
    request<PrepareBriefing>(
      `${API_V1}/places/${encodeURIComponent(placeId)}/briefing`,
    ),
);
