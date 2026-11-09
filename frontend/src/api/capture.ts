import {
  CURRENT_PLACE_NAME,
  SELECTION_READING,
  todaysCatch,
} from '../mocks/capture';
import { getCurrentCoords } from '../location/location';
import { PLACES } from '../mocks/places';
import { ALL_TANGO, TANGO } from '../mocks/tango';
import type {
  CatchEntry,
  DetectedItem,
  Detection,
  NormalizedBox,
  SelectionReading,
  Tango,
} from '../types';
import { API_V1, ApiError, mockDelay, pick, request } from './client';
import type { PlaceResponse } from './places';
import {
  type FlashcardCatchResponse,
  flashcardToTango,
  type FlashcardResponse,
} from './tango';
import { copy } from '../copy';

/** Shape returned by the existing backend (app/schemas/capture.py). */
export interface CaptureResponse {
  capture_id: string;
  image_url: string;
  detected_items: DetectedItem[];
  created_at: string;
}

export interface CurrentPlace {
  name: string;
  /** Google place id (or built-in id) when the spot matched a known place. */
  placeId: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Where the user is now: device GPS, then the place at that spot.
 * Mock: a fixed place.
 */
export const getCurrentPlace = pick(
  'places',
  () => {
    const place = PLACES['nakano-supermarket'];
    return mockDelay<CurrentPlace>(
      {
        name: CURRENT_PLACE_NAME,
        placeId: place.id,
        lat: place.lat,
        lng: place.lng,
      },
      100,
    );
  },
  async (): Promise<CurrentPlace> => {
    const coords = await getCurrentCoords();
    if (!coords) {
      return {
        name: copy.capture.placeLocationOff,
        placeId: null,
        lat: null,
        lng: null,
      };
    }
    try {
      const place = await request<PlaceResponse | null>(
        `${API_V1}/places/nearby`,
        { query: { lat: coords.lat, lng: coords.lng } },
      );
      if (place) {
        // English name reads best in the place pill; Japanese is in the Tango itself.
        return {
          name: place.name.meaning || place.name.text,
          placeId: place.id,
          lat: coords.lat,
          lng: coords.lng,
        };
      }
    } catch {
      // Lookup failed: keep the coordinates so the catch still gets a pin.
    }
    return { name: copy.capture.placeNearYou, placeId: null, ...coords };
  },
);

/** Uploads a photo for server-side recognition (Cloud Vision / Gemini). */
export const uploadCapture = pick(
  'capture',
  (
    _imageBase64: string,
    _mimeType: string = 'image/jpeg',
    _where?: PlaceInput,
  ) => {
    return mockDelay<CaptureResponse>({
      capture_id: 'cap_mock',
      image_url: '',
      detected_items: [],
      created_at: new Date().toISOString(),
    });
  },
  // Existing endpoint: POST /api/v1/captures
  (imageBase64: string, mimeType: string = 'image/jpeg', where?: PlaceInput) =>
    request<CaptureResponse>(`${API_V1}/captures`, {
      method: 'POST',
      body: {
        image_base64: imageBase64,
        mime_type: mimeType,
        place_id: where?.placeId ?? undefined,
        place_name: where?.placeName ?? undefined,
        lat: where?.lat ?? undefined,
        lng: where?.lng ?? undefined,
      },
    }),
);

/** Where a Tango was found, sent with each catch. */
export interface PlaceInput {
  /** Only for a matched place; labels like "Location off" are not sent. */
  placeName?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
}

export interface CatchInput extends PlaceInput {
  detection?: Detection;
  tangoId?: string;
  /** Required by the real backend: the upload the detection came from. */
  captureId?: string;
  language?: string;
  /** When true, existing words are left as-is without adding an extra sighting. */
  onlyIfNew?: boolean;
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
  ({ detection, tangoId, placeName, onlyIfNew }: CatchInput) => {
    const id = tangoId ?? detection?.tangoId;
    const existing =
      (id ? TANGO[id] : undefined) ??
      (detection?.japanese_text
        ? ALL_TANGO.find(t => t.text === detection.japanese_text)
        : undefined);
    if (existing && onlyIfNew) {
      return mockDelay<CatchResult>({
        tango: existing,
        created: false,
        sightingId: null,
      });
    }
    const tango: Tango = existing || {
      id: detection?.item_id ?? `tango-${Date.now()}`,
      kind: detection?.item_type === 'object' ? 'object' : 'word',
      text: detection?.japanese_text ?? '',
      reading: detection?.reading ?? '',
      romaji: '',
      meaning: detection?.english_gloss ?? '',
      sightings: [],
      strength: 0,
      stage: 'flashcard',
      known: false,
      history: [],
      examples: [],
    };
    todaysCatch.unshift({ tango, placeName: placeName ?? '', status: 'new' });
    return mockDelay<CatchResult>({
      tango,
      created: !existing,
      sightingId: null,
    });
  },
  // POST /api/v1/flashcards/generate. One card per word: a repeat catch adds a sighting.
  // Without captureId it's a live catch: the text was read on the phone, no photo.
  async ({
    detection,
    captureId,
    placeName,
    placeId,
    lat,
    lng,
    language,
    onlyIfNew,
  }: CatchInput) => {
    if (!captureId && !detection?.japanese_text) {
      throw new ApiError(copy.errors.nothingToCatch);
    }
    const result = await request<FlashcardCatchResponse>(
      `${API_V1}/flashcards/generate`,
      {
        method: 'POST',
        body: {
          capture_id: captureId,
          // Live item ids are made up on the phone; only photo reads have real ones.
          item_id: captureId ? detection?.item_id : undefined,
          selected_text: detection?.japanese_text,
          place_id: placeId,
          place_name: placeName,
          lat,
          lng,
          language,
          only_if_new: onlyIfNew,
        },
      },
    );
    return {
      tango: flashcardToTango(result.card),
      created: result.created,
      sightingId: result.sighting_id || null,
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
  (_tangoId: string, _recognized: boolean, _where?: PlaceInput) => {
    return mockDelay<void>(undefined, 100);
  },
  // POST /api/v1/flashcards/{id}/sightings: "seen again" adds a sighting and counts as a review.
  async (tangoId: string, recognized: boolean, where?: PlaceInput) => {
    await request<FlashcardCatchResponse>(
      `${API_V1}/flashcards/${encodeURIComponent(tangoId)}/sightings`,
      {
        method: 'POST',
        body: {
          recognized,
          place_id: where?.placeId,
          place_name: where?.placeName,
          lat: where?.lat,
          lng: where?.lng,
        },
      },
    );
  },
);
