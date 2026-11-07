import { ALL_TANGO, TANGO } from '../mocks/tango';
import type { Strength, Tango } from '../types';
import { API_V1, mockDelay, pick, request } from './client';

/** Shape returned by the existing backend (app/schemas/flashcard.py). */
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
  use_cases: { japanese: string; reading: string; english: string }[];
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
}

/**
 * Backend "flashcard" -> frontend "Tango".
 * TODO agree with backend: flashcards have no place/sightings, no `kind`
 * and no 0-4 strength, so those are approximated here.
 */
export function flashcardToTango(card: FlashcardResponse): Tango {
  const { review_count: count, mastered } = card.review_stats;
  const strength = (mastered ? 4 : Math.min(3, count)) as Strength;
  return {
    id: card.flashcard_id,
    kind: card.part_of_speech.toLowerCase().includes('phrase') ? 'phrase' : 'word',
    text: card.kanji,
    reading: card.reading,
    romaji: card.romaji,
    meaning: card.meaning,
    sightings: [],
    strength,
    known: mastered,
    history: [],
    examples: card.use_cases.map(useCase => ({
      register: 'easy' as const,
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
  (query: string = '') =>
    mockDelay<Tango[]>(ALL_TANGO.filter(t => matches(t, query)), 200),
  // Existing endpoint: GET /api/v1/flashcards. Search is client-side for now.
  async (query: string = '') => {
    const cards = await request<FlashcardResponse[]>(`${API_V1}/flashcards`);
    return cards.map(flashcardToTango).filter(t => matches(t, query));
  },
);

export const getTango = pick(
  (id: string) => mockDelay<Tango>(TANGO[id] ?? ALL_TANGO[0]),
  // Existing endpoint: GET /api/v1/flashcards/{flashcard_id}
  async (id: string) =>
    flashcardToTango(
      await request<FlashcardResponse>(`${API_V1}/flashcards/${encodeURIComponent(id)}`),
    ),
);
