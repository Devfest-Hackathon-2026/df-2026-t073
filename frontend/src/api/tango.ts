import { ALL_TANGO, TANGO } from '../mocks/tango';
import type { Strength, Tango, TangoEvent, TangoKind } from '../types';
import { API_V1, mockDelay, pick, request } from './client';

/** Sighting as stored by the backend (app/schemas/flashcard.py). */
export interface SightingResponse {
  sighting_id: string;
  capture_id: string | null;
  place_id: string | null;
  place_name: string;
  lat: number | null;
  lng: number | null;
  seen_at: string;
  image_url: string | null;
}

export interface HistoryEventResponse {
  type: 'caught' | 'reviewed' | 'seen_again';
  at: string;
  detail: string;
  sighting_id: string | null;
  strength_after: number;
}

/** Shape returned by the backend (app/schemas/flashcard.py). */
export interface FlashcardResponse {
  flashcard_id: string;
  capture_id: string;
  item_id: string | null;
  image_url: string;
  bounding_box: { x: number; y: number }[];
  kanji: string;
  reading: string;
  romaji: string;
  meaning: string;
  part_of_speech: string;
  kind: TangoKind;
  use_cases: {
    japanese: string;
    reading: string;
    english: string;
    register: 'easy' | 'keigo';
  }[];
  related_vocab: {
    kanji: string;
    reading: string;
    meaning: string;
    relation_note: string;
  }[];
  review_stats: {
    review_count: number;
    last_reviewed_at: string | null;
    next_review_at: string;
    mastered: boolean;
  };
  created_at: string;
  strength: number;
  sightings: SightingResponse[];
  history: HistoryEventResponse[];
}

/** POST /flashcards/generate and POST /flashcards/{id}/sightings. */
export interface FlashcardCatchResponse {
  card: FlashcardResponse;
  /** False when the word already had a card and this added a sighting. */
  created: boolean;
  sighting_id: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DAYS[date.getDay()];
}

function toEvent(
  event: HistoryEventResponse,
  previousStrength: number,
): TangoEvent {
  const change = event.strength_after - previousStrength;
  const badge = change > 0 ? `+${change}` : change < 0 ? `${change}` : '';
  const when = dayLabel(event.at);
  if (event.type === 'caught') {
    return {
      type: 'caught',
      label: 'Caught',
      detail: [event.detail, when].filter(Boolean).join(' · '),
      badge: 'New',
    };
  }
  if (event.type === 'seen_again') {
    return {
      type: 'seen_again',
      label: 'Seen again',
      detail: [event.detail, when, 'camera'].filter(Boolean).join(' · '),
      badge,
    };
  }
  return {
    type: 'reviewed',
    label: event.detail === 'again' ? 'Missed in review' : 'Got it in review',
    detail: when,
    badge,
  };
}

/** Backend "flashcard" -> frontend "Tango". History is shown newest first. */
export function flashcardToTango(card: FlashcardResponse): Tango {
  const strength = Math.max(0, Math.min(4, card.strength ?? 0)) as Strength;
  const history = card.history ?? [];
  const events = history.map((event, i) =>
    toEvent(event, i > 0 ? history[i - 1].strength_after : 0),
  );
  return {
    id: card.flashcard_id,
    kind: card.kind ?? 'word',
    text: card.kanji,
    reading: card.reading,
    romaji: card.romaji,
    meaning: card.meaning,
    sightings: (card.sightings ?? []).map(s => ({
      placeId: s.place_id ?? '',
      placeName: s.place_name,
      lat: s.lat ?? 0,
      lng: s.lng ?? 0,
      seenAt: s.seen_at,
      imageUrl: s.image_url ?? undefined,
    })),
    strength,
    known: strength === 4,
    history: events.reverse(),
    examples: card.use_cases.map(useCase => ({
      register: useCase.register ?? 'easy',
      jp: {
        text: useCase.japanese,
        reading: useCase.reading,
        meaning: useCase.english,
      },
    })),
  };
}

function matches(tango: Tango, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [
    tango.text,
    tango.reading,
    tango.romaji,
    tango.meaning,
    ...tango.sightings.map(s => s.placeName),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

/** All saved Tango, filtered by word, reading, meaning or place. */
export const listTango = pick(
  'tango',
  (query: string = '') =>
    mockDelay<Tango[]>(
      ALL_TANGO.filter(t => matches(t, query)),
      200,
    ),
  // Existing endpoint: GET /api/v1/flashcards. Search is client-side for now.
  async (query: string = '') => {
    const cards = await request<FlashcardResponse[]>(`${API_V1}/flashcards`);
    return cards.map(flashcardToTango).filter(t => matches(t, query));
  },
);

export const getTango = pick(
  'tango',
  (id: string) => mockDelay<Tango>(TANGO[id] ?? ALL_TANGO[0]),
  // Existing endpoint: GET /api/v1/flashcards/{flashcard_id}
  async (id: string) =>
    flashcardToTango(
      await request<FlashcardResponse>(
        `${API_V1}/flashcards/${encodeURIComponent(id)}`,
      ),
    ),
);
