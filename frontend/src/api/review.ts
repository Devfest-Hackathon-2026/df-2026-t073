import {
  REVIEW_CARD,
  REVIEW_SUMMARY,
  SESSION,
  SESSION_RESULT,
} from '../mocks/review';
import type {
  Exercise,
  JpText,
  ReviewCard,
  ReviewSession,
  ReviewSummary,
  SessionResult,
} from '../types';
import { API_V1, mockDelay, pick, request } from './client';
import { flashcardToTango, type FlashcardResponse } from './tango';

// ---- Backend shapes (app/schemas/review.py) ----

interface JpOptionResponse {
  text: string;
  reading: string;
  romaji: string;
}

interface ReviewCardResponse {
  due_count: number;
  minutes: number;
  areas: string[];
  sample: FlashcardResponse[];
  more_count: number;
}

interface ReviewSummaryResponse {
  due_count: number;
  minutes: number;
  place_cue_count: number;
  collections: {
    id: string;
    label: string;
    count: number;
    is_place: boolean;
    is_place_cue: boolean;
  }[];
  exercise_types: { id: string; label: string; enabled: boolean }[];
  total_tango: number;
}

type ExerciseResponse =
  | {
      id: string;
      type: 'multiple_choice';
      flashcard_id: string;
      prompt: JpOptionResponse;
      options: string[];
      answer_index: number;
      place_hint: string;
      example: { japanese: string; reading: string; english: string } | null;
      next_step: string;
    }
  | {
      id: string;
      type: 'fill_gap';
      flashcard_id: string;
      image_url: string;
      caption: string;
      gap: { x: number; y: number; w: number; h: number };
      options: JpOptionResponse[];
      answer_index: number;
      note: string;
    };

interface ReviewSessionResponse {
  session_id: string;
  exercises: ExerciseResponse[];
}

interface SessionResultResponse {
  reviewed: number;
  minutes: number;
  biggest_win: {
    flashcard_id: string;
    tango: JpOptionResponse;
    meaning: string;
    title: string;
    detail: string;
  } | null;
  by_area: { area: string; count: number }[];
  next: null;
}

// ---- Adapters ----

function toJp(option: JpOptionResponse, meaning?: string): JpText {
  return {
    text: option.text,
    reading: option.reading || undefined,
    romaji: option.romaji || undefined,
    meaning,
  };
}

function toExercise(e: ExerciseResponse): Exercise {
  if (e.type === 'fill_gap') {
    return {
      id: e.id,
      type: 'fill_gap',
      tangoId: e.flashcard_id,
      photo: { imageUrl: e.image_url, caption: e.caption, lines: [] },
      gap: e.gap,
      options: e.options.map(o => toJp(o)),
      answerIndex: e.answer_index,
      note: e.note,
    };
  }
  return {
    id: e.id,
    type: 'multiple_choice',
    tangoId: e.flashcard_id,
    prompt: toJp(e.prompt),
    options: e.options,
    answerIndex: e.answer_index,
    placeHint: e.place_hint,
    example: e.example
      ? {
          text: e.example.japanese,
          reading: e.example.reading,
          en: e.example.english,
        }
      : undefined,
    nextStep: e.next_step,
  };
}

// ---- API ----

/** Small review card on Today. */
export const getReviewCard = pick(
  'review',
  () => mockDelay<ReviewCard>(REVIEW_CARD),
  async () => {
    const r = await request<ReviewCardResponse>(`${API_V1}/review/card`);
    return {
      dueCount: r.due_count,
      minutes: r.minutes,
      areas: r.areas,
      sample: r.sample.map(flashcardToTango),
      moreCount: r.more_count,
    };
  },
);

export const getReviewSummary = pick(
  'review',
  () => mockDelay<ReviewSummary>(REVIEW_SUMMARY),
  async () => {
    const r = await request<ReviewSummaryResponse>(`${API_V1}/review/summary`);
    return {
      dueCount: r.due_count,
      minutes: r.minutes,
      placeCueCount: r.place_cue_count,
      collections: r.collections.map(c => ({
        id: c.id,
        label: c.label,
        count: c.count,
        isPlace: c.is_place,
        isPlaceCue: c.is_place_cue,
      })),
      exerciseTypes: r.exercise_types,
      totalTango: r.total_tango,
    };
  },
);

/** Starts a session: up to 10 Tango, weakest first. */
export const getReviewSession = pick(
  'review',
  (_collectionId?: string) =>
    mockDelay<ReviewSession>({ sessionId: null, exercises: SESSION }, 400),
  async (collectionId?: string) => {
    const r = await request<ReviewSessionResponse>(`${API_V1}/review/session`, {
      query: { collection: collectionId },
    });
    return { sessionId: r.session_id, exercises: r.exercises.map(toExercise) };
  },
);

/** Records one answer (POST /flashcards/{id}/review), inside the session when there is one. */
export const submitAnswer = pick(
  'review',
  (_tangoId: string, _correct: boolean, _sessionId: string | null) =>
    mockDelay<void>(undefined, 100),
  async (tangoId: string, correct: boolean, sessionId: string | null) => {
    await request<FlashcardResponse>(
      `${API_V1}/flashcards/${encodeURIComponent(tangoId)}/review`,
      {
        method: 'POST',
        body: {
          rating: correct ? 'good' : 'again',
          session_id: sessionId ?? undefined,
        },
      },
    );
  },
);

export const getSessionResult = pick(
  'review',
  (_sessionId: string | null) => mockDelay<SessionResult>(SESSION_RESULT, 400),
  async (sessionId: string | null): Promise<SessionResult> => {
    if (!sessionId) {
      return {
        reviewed: 0,
        minutes: 0,
        biggestWin: null,
        byArea: [],
        next: null,
      };
    }
    const r = await request<SessionResultResponse>(
      `${API_V1}/review/session/${encodeURIComponent(sessionId)}/result`,
    );
    return {
      reviewed: r.reviewed,
      minutes: r.minutes,
      biggestWin: r.biggest_win
        ? {
            tango: toJp(r.biggest_win.tango, r.biggest_win.meaning),
            title: r.biggest_win.title,
            detail: r.biggest_win.detail,
          }
        : null,
      byArea: r.by_area,
      next: null,
    };
  },
);
