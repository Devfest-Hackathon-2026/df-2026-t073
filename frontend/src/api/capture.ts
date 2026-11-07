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
import { flashcardToTango, type FlashcardResponse } from './tango';

/** Shape returned by the existing backend (app/schemas/capture.py). */
export interface CaptureResponse {
  capture_id: string;
  image_url: string;
  detected_items: DetectedItem[];
  created_at: string;
}

export const getCurrentPlaceName = pick(
  () => mockDelay(CURRENT_PLACE_NAME, 100),
  // TODO confirm endpoint with backend (reverse geocode via Google Maps)
  async () =>
    (await request<{ name: string }>(`${API_V1}/places/nearby`)).name,
);

/** Uploads a photo for server-side recognition (Cloud Vision / Gemini). */
export const uploadCapture = pick(
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
  /** Required by the real backend: the upload the detection came from. */
  captureId?: string;
}

export const catchTango = pick(
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
    return mockDelay<Tango>(tango);
  },
  // Existing endpoint: POST /api/v1/flashcards/generate
  // TODO agree with backend: send the catch location (placeName, lat, lng) too.
  async ({ detection, captureId }: CatchInput) => {
    if (!captureId) {
      throw new ApiError('Upload the photo with uploadCapture() before catching.');
    }
    const card = await request<FlashcardResponse>(`${API_V1}/flashcards/generate`, {
      method: 'POST',
      body: {
        capture_id: captureId,
        item_id: detection?.item_id,
        selected_text: detection?.japanese_text,
      },
    });
    return flashcardToTango(card);
  },
);

export const undoCatch = pick(
  (tangoId: string) => {
    const index = todaysCatch.findIndex(entry => entry.tango.id === tangoId);
    if (index >= 0) {
      todaysCatch.splice(index, 1);
    }
    return mockDelay<void>(undefined, 100);
  },
  // Existing endpoint: DELETE /api/v1/flashcards/{flashcard_id}
  (tangoId: string) =>
    request<void>(`${API_V1}/flashcards/${encodeURIComponent(tangoId)}`, {
      method: 'DELETE',
    }),
);

export const getTodaysCatch = pick(
  () => mockDelay<CatchEntry[]>(todaysCatch),
  // TODO confirm endpoint with backend
  () => request<CatchEntry[]>(`${API_V1}/catches/today`),
);

/** Manual fallback: read only the part of the photo inside `box`. */
export const readSelection = pick(
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
  (_tangoId: string, _recognized: boolean) => {
    return mockDelay<void>(undefined, 100);
  },
  // Existing endpoint: POST /api/v1/flashcards/{flashcard_id}/review
  (tangoId: string, recognized: boolean) =>
    request<void>(`${API_V1}/flashcards/${encodeURIComponent(tangoId)}/review`, {
      method: 'POST',
      body: { rating: recognized ? 'good' : 'again' },
    }),
);
