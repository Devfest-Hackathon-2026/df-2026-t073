import { QUESTION_TYPE_LABEL } from '../features/review/labels';
import { todaysCatch } from '../mocks/capture';
import { ALL_TANGO, TANGO } from '../mocks/tango';
import type {
  CaptureFormat,
  QuestionType,
  RelatedVocab,
  ReviewStage,
  Strength,
  Tango,
  TangoEvent,
  TangoEventType,
  TangoKind,
} from '../types';
import { API_V1, mockDelay, pick, request } from './client';
import { clearCache } from '../cache/storage';
import { copy } from '../copy';

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
  type: TangoEventType;
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
  favorite?: boolean;
  kanji: string;
  reading: string;
  romaji: string;
  meaning: string;
  part_of_speech: string;
  kind: TangoKind;
  capture_format: CaptureFormat;
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
  saved_sentences?: {
    sentence_id: string;
    text: string;
    reading: string | null;
    romaji: string | null;
    meaning: string | null;
    kind: 'yours' | 'suggested';
    place_name: string;
  }[];
  review_stats: {
    review_count: number;
    last_reviewed_at: string | null;
    next_review_at: string;
    mastered: boolean;
    stage: ReviewStage;
    stage_streak?: number;
    miss_streak?: number;
    last_question_type?: QuestionType | null;
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

function dayLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : copy.common.weekdays[date.getDay()];
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
      label: copy.history.caught,
      detail: event.detail,
      when,
      badge: copy.common.new,
    };
  }
  if (event.type === 'seen_again') {
    return {
      type: 'seen_again',
      label: copy.history.seenAgain,
      detail: event.detail,
      when,
      badge,
    };
  }
  if (
    event.type === 'heard_in_rehearsal' ||
    event.type === 'said_in_rehearsal'
  ) {
    return {
      type: event.type,
      label:
        event.type === 'heard_in_rehearsal'
          ? copy.history.heardInRehearsal
          : copy.history.saidInRehearsal,
      detail: event.detail,
      when,
      badge: '',
    };
  }
  const missed =
    event.detail === 'again' ||
    change < 0 ||
    (change === 0 &&
      previousStrength < 4 &&
      event.detail !== 'good' &&
      event.detail !== 'easy');
  const qLabel =
    event.detail in QUESTION_TYPE_LABEL
      ? QUESTION_TYPE_LABEL[event.detail as QuestionType]
      : '';
  return {
    type: 'reviewed',
    label: missed ? copy.history.missedInReview : copy.history.gotItInReview,
    detail: qLabel,
    when,
    badge,
  };
}

/** Backend "flashcard" -> frontend "Tango". History is shown newest first. */
export function flashcardToTango(card: FlashcardResponse): Tango {
  const strength = Math.max(0, Math.min(4, card.strength ?? 0)) as Strength;
  // The server always fills capture_format (from the kind, for older cards).
  const captureFormat = card.capture_format;
  // The server always sends the stage (inferred for older cards, normalized for the photo).
  const stage = card.review_stats.stage;
  const history = card.history ?? [];
  const events = history.map((event, i) =>
    toEvent(event, i > 0 ? history[i - 1].strength_after : 0),
  );
  return {
    id: card.flashcard_id,
    kind: card.kind ?? 'word',
    captureFormat,
    stage,
    text: card.kanji,
    reading: card.reading,
    romaji: card.romaji,
    meaning: card.meaning,
    sightings: (card.sightings ?? []).map(s => ({
      placeId: s.place_id ?? '',
      placeName: s.place_name,
      lat: s.lat,
      lng: s.lng,
      seenAt: s.seen_at,
      imageUrl: s.image_url ?? undefined,
    })),
    strength,
    known: strength === 4,
    favorite: card.favorite ?? false,
    history: events.reverse(),
    examples: card.use_cases.map(useCase => ({
      register: useCase.register ?? 'easy',
      jp: {
        text: useCase.japanese,
        reading: useCase.reading,
        meaning: useCase.english,
      },
    })),
    relatedVocab: (card.related_vocab ?? []).map(r => ({
      kanji: r.kanji,
      reading: r.reading,
      meaning: r.meaning,
      relationNote: r.relation_note,
    })),
    savedSentences: (card.saved_sentences ?? []).map(s => ({
      id: s.sentence_id,
      jp: {
        text: s.text,
        reading: s.reading ?? undefined,
        romaji: s.romaji ?? undefined,
        meaning: s.meaning ?? undefined,
      },
      kind: s.kind,
      placeName: s.place_name,
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
  async (query: string = '', options?: { since?: string | Date }) => {
    const sinceParam =
      options?.since instanceof Date
        ? options.since.toISOString()
        : options?.since;
    const cards = await request<FlashcardResponse[]>(`${API_V1}/flashcards`, {
      query: sinceParam ? { since: sinceParam } : undefined,
    });
    return cards.map(flashcardToTango).filter(t => matches(t, query));
  },
);

/** The user's Tango seen at one place (GET /flashcards?place_id=). */
export const listTangoAtPlace = pick(
  'tango',
  (placeId: string) =>
    mockDelay<Tango[]>(
      ALL_TANGO.filter(t => t.sightings.some(s => s.placeId === placeId)),
      200,
    ),
  async (placeId: string) =>
    (
      await request<FlashcardResponse[]>(`${API_V1}/flashcards`, {
        query: { place_id: placeId },
      })
    ).map(flashcardToTango),
);

/** DELETE /flashcards/{id}/sentences/{sentenceId}: returns the updated Tango. */
export const removeSavedSentence = pick(
  'tango',
  (tangoId: string, sentenceId: string) => {
    const t = TANGO[tangoId] ?? ALL_TANGO[0];
    t.savedSentences = (t.savedSentences ?? []).filter(s => s.id !== sentenceId);
    return mockDelay<Tango>(t, 100);
  },
  async (tangoId: string, sentenceId: string) =>
    flashcardToTango(
      await request<FlashcardResponse>(
        `${API_V1}/flashcards/${encodeURIComponent(
          tangoId,
        )}/sentences/${encodeURIComponent(sentenceId)}`,
        { method: 'DELETE' },
      ),
    ),
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

/** Marks or unmarks a Tango as a favorite. */
export const setFavorite = pick(
  'tango',
  (id: string, favorite: boolean) => {
    const found = TANGO[id];
    if (found) {
      found.favorite = favorite;
    }
    return mockDelay<Tango>({ ...(found ?? ALL_TANGO[0]), favorite }, 150);
  },
  // PATCH /api/v1/flashcards/{id}
  async (id: string, favorite: boolean) => {
    // Generate optimistic fallback representation
    const fallbackResponse: FlashcardResponse = {
      flashcard_id: id,
      capture_id: '',
      item_id: null,
      image_url: '',
      bounding_box: [],
      favorite,
      kanji: '',
      reading: '',
      romaji: '',
      meaning: '',
      part_of_speech: '',
      kind: 'word',
      capture_format: 'object',
      use_cases: [],
      related_vocab: [],
      created_at: new Date().toISOString(),
      strength: 1,
      sightings: [],
      history: [],
      review_stats: {
        review_count: 0,
        last_reviewed_at: null,
        next_review_at: new Date().toISOString(),
        mastered: false,
        stage: 'flashcard',
      },
    };
    const updated = await request<FlashcardResponse>(
      `${API_V1}/flashcards/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: { favorite },
        outboxFallback: fallbackResponse,
      },
    );
    await Promise.all([
      clearCache('tango:'),
      clearCache('review:'),
    ]);
    return flashcardToTango(updated);
  },
);

/** Deletes a saved flashcard/Tango. */
export const deleteTango = pick(
  'tango',
  (id: string) => {
    delete TANGO[id];
    const index = ALL_TANGO.findIndex(t => t.id === id);
    if (index >= 0) {
      ALL_TANGO.splice(index, 1);
    }
    for (let i = todaysCatch.length - 1; i >= 0; i--) {
      if (todaysCatch[i].tango.id === id) {
        todaysCatch.splice(i, 1);
      }
    }
    return mockDelay<void>(undefined, 100);
  },
  async (id: string) => {
    await request<void>(`${API_V1}/flashcards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await Promise.all([
      clearCache('tango:'),
      clearCache('review:'),
      clearCache('today:'),
    ]);
  },
);

/** Expands a Tango with contextually related vocabulary generated by Gemini. */
export const expandTango = pick(
  'tango',
  (id: string, _language: string = 'English') => {
    const t = TANGO[id] ?? ALL_TANGO[0];
    const dummy: RelatedVocab[] = [
      {
        kanji: '関連語',
        reading: 'かんれんご',
        meaning: 'related word',
        relationNote: 'Related vocabulary example',
      },
    ];
    t.relatedVocab = dummy;
    return mockDelay<RelatedVocab[]>(dummy, 300);
  },
  async (id: string, language: string = 'English') => {
    const items = await request<
      {
        kanji: string;
        reading: string;
        meaning: string;
        relation_note: string;
      }[]
    >(`${API_V1}/flashcards/${encodeURIComponent(id)}/expand`, {
      method: 'POST',
      query: { language },
    });
    return items.map(r => ({
      kanji: r.kanji,
      reading: r.reading,
      meaning: r.meaning,
      relationNote: r.relation_note,
    }));
  },
);
