import {
  CURRENT_PLACE_NAME,
  SELECTION_READING,
  todaysCatch,
} from '../mocks/capture';
import { TANGO } from '../mocks/tango';
import type {
  CatchEntry,
  DetectedItem,
  Detection,
  NormalizedBox,
  SelectionReading,
  Tango,
} from '../types';
import { API_V1, ApiError, mockDelay, pick, request } from './client';
import {
  type FlashcardCatchResponse,
  flashcardToTango,
  type FlashcardResponse,
} from './tango';

/** Shape returned by the existing backend (app/schemas/capture.py). */
export interface CaptureResponse {
  capture_id: string;
  image_url: string;
  detected_items: DetectedItem[];
  created_at: string;
}

export const getCurrentPlaceName = pick(
  'places',
  () => mockDelay(CURRENT_PLACE_NAME, 100),
  // TODO confirm endpoint with backend (reverse geocode via Google Maps)
  async () => (await request<{ name: string }>(`${API_V1}/places/nearby`)).name,
);

/** Uploads a photo for server-side recognition (Cloud Vision / Gemini). */
export const uploadCapture = pick(
  'capture',
  (_imageBase64: string, _mimeType: string = 'image/jpeg') => {
    return mockDelay<CaptureResponse>({
      capture_id: 'cap_mock',
      image_url: '',
      detected_items: [],
      created_at: new Date().toISOString(),
    });
  },
  // Existing endpoint: POST /api/v1/captures
  (imageBase64: string, mimeType: string = 'image/jpeg') =>
    request<CaptureResponse>(`${API_V1}/captures`, {
      method: 'POST',
      body: { image_base64: imageBase64, mime_type: mimeType },
    }),
);

export interface CatchInput {
  detection?: Detection;
  tangoId?: string;
  placeName: string;
  lat?: number;
  lng?: number;
  /** Required by the real backend: the upload the detection came from. */
  captureId?: string;
}

export interface CatchResult {
  tango: Tango;
  /** False when the word already had a card and this catch added a sighting. */
  created: boolean;
  /** What Undo removes. Null for mock catches. */
  sightingId: string | null;
}

/** What the Undo button needs to take back a catch. */
export interface UndoTarget {
  tangoId: string;
  sightingId: string | null;
}

export const catchTango = pick(
  'capture',
  ({ detection, tangoId, placeName }: CatchInput) => {
    const id = tangoId ?? detection?.tangoId;
    const tango: Tango = (id && TANGO[id]) || {
      id: detection?.item_id ?? `tango-${Date.now()}`,
      kind: detection?.item_type === 'object' ? 'object' : 'word',
      text: detection?.japanese_text ?? '',
      reading: detection?.reading ?? '',
      romaji: '',
      meaning: detection?.english_gloss ?? '',
      sightings: [],
      strength: 0,
      known: false,
      history: [],
      examples: [],
    };
    todaysCatch.unshift({ tango, placeName, status: 'new' });
    return mockDelay<CatchResult>({ tango, created: true, sightingId: null });
  },
  // POST /api/v1/flashcards/generate. One card per word: a repeat catch adds a sighting.
  async ({ detection, captureId, placeName, lat, lng }: CatchInput) => {
    if (!captureId) {
      throw new ApiError(
        'Upload the photo with uploadCapture() before catching.',
      );
    }
    const result = await request<FlashcardCatchResponse>(
      `${API_V1}/flashcards/generate`,
      {
        method: 'POST',
        body: {
          capture_id: captureId,
          item_id: detection?.item_id,
          selected_text: detection?.japanese_text,
          place_name: placeName,
          lat,
          lng,
        },
      },
    );
    return {
      tango: flashcardToTango(result.card),
      created: result.created,
      sightingId: result.sighting_id,
    };
  },
);

export const undoCatch = pick(
  'capture',
  ({ tangoId }: UndoTarget) => {
    const index = todaysCatch.findIndex(entry => entry.tango.id === tangoId);
    if (index >= 0) {
      todaysCatch.splice(index, 1);
    }
    return mockDelay<void>(undefined, 100);
  },
  // Removes just this catch's sighting (the card goes too if it was the only one).
  // Without a sighting id, falls back to deleting the card.
  async ({ tangoId, sightingId }: UndoTarget) => {
    const card = encodeURIComponent(tangoId);
    if (sightingId) {
      await request<FlashcardResponse | null>(
        `${API_V1}/flashcards/${card}/sightings/${encodeURIComponent(
          sightingId,
        )}`,
        { method: 'DELETE' },
      );
      return;
    }
    await request<void>(`${API_V1}/flashcards/${card}`, { method: 'DELETE' });
  },
);

export const getTodaysCatch = pick(
  'capture',
  () => mockDelay<CatchEntry[]>(todaysCatch),
  // Built from GET /api/v1/flashcards: cards with a sighting today (device time),
  // labelled with today's latest place.
  async () => {
    const cards = await request<FlashcardResponse[]>(`${API_V1}/flashcards`, {
      query: { limit: 100 },
    });
    const today = new Date().toDateString();
    const entries: CatchEntry[] = [];
    for (const card of cards) {
      const todays = (card.sightings ?? []).filter(
        s => new Date(s.seen_at).toDateString() === today,
      );
      if (todays.length === 0) {
        continue;
      }
      entries.push({
        tango: flashcardToTango(card),
        placeName: todays[todays.length - 1].place_name,
        status: card.review_stats.review_count > 0 ? 'reviewed' : 'new',
      });
    }
    return entries;
  },
);

/** Manual fallback: read only the part of the photo inside `box`. */
export const readSelection = pick(
  'capture',
  (_photoUri: string | null, _box: NormalizedBox) => {
    return mockDelay<SelectionReading>(SELECTION_READING, 700);
  },
  // TODO confirm endpoint with backend (Gemini reads the cropped area)
  (photoUri: string | null, box: NormalizedBox) =>
    request<SelectionReading>(`${API_V1}/captures/read-selection`, {
      method: 'POST',
      body: { photoUri, box },
    }),
);

/** "Did you recognize this Tango?" answer from the camera. */
export const recordRecognition = pick(
  'capture',
  (_tangoId: string, _recognized: boolean, _placeName?: string) => {
    return mockDelay<void>(undefined, 100);
  },
  // POST /api/v1/flashcards/{id}/sightings: "seen again" adds a sighting and counts as a review.
  async (tangoId: string, recognized: boolean, placeName?: string) => {
    await request<FlashcardCatchResponse>(
      `${API_V1}/flashcards/${encodeURIComponent(tangoId)}/sightings`,
      {
        method: 'POST',
        body: { recognized, place_name: placeName },
      },
    );
  },
);
