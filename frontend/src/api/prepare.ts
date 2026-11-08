import { briefingFor } from '../mocks/prepare';
import type { PrepareBriefing } from '../types';
import { API_V1, mockDelay, pick, request } from './client';
import { type PlaceResponse, toPlace } from './places';

/** Backend shape (backend/app/schemas/prepare.py). */
interface BriefingResponse {
  place: PlaceResponse;
  steps: string[];
  tango: {
    text: string;
    reading: string;
    romaji: string;
    meaning: string;
    flashcard_id: string | null;
  }[];
  tips: {
    id: string;
    quote: string;
    learners: number;
    when: string;
    in_rehearsal: boolean;
  }[];
  source: string;
}

/** Visit briefing: what to expect, Tango for the visit, anonymous tips. */
export const getBriefing = pick(
  'prepare',
  (placeId: string) => {
    const b = briefingFor(placeId);
    return mockDelay<PrepareBriefing>(
      {
        ...b,
        tango: b.tango.map(t => ({
          text: t.text,
          reading: t.reading,
          romaji: t.romaji,
          meaning: t.meaning,
          tangoId: t.id,
        })),
      },
      500,
    );
  },
  async (
    placeId: string,
    language: string = 'English',
  ): Promise<PrepareBriefing> => {
    const r = await request<BriefingResponse>(
      `${API_V1}/places/${encodeURIComponent(placeId)}/briefing`,
      { query: { language } },
    );
    return {
      place: toPlace(r.place),
      steps: r.steps,
      tango: r.tango.map(t => ({
        text: t.text,
        reading: t.reading || undefined,
        romaji: t.romaji || undefined,
        meaning: t.meaning || undefined,
        tangoId: t.flashcard_id,
      })),
      tips: r.tips.map(t => ({
        id: t.id,
        quote: t.quote,
        learners: t.learners,
        when: t.when,
        inRehearsal: t.in_rehearsal,
      })),
      source: r.source,
    };
  },
);
