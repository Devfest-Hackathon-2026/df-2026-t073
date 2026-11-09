import {
  REVIEW_CARD,
  REVIEW_SUMMARY,
  SESSION,
  SESSION_RESULT,
} from '../mocks/review';
import type {
  Exercise,
  JpText,
  PhotoLayer,
  ReviewCard,
  ReviewSession,
  ReviewStage,
  ReviewSummary,
  SessionResult,
} from '../types';
import { ALL_TANGO } from '../mocks/tango';
import { API_V1, mockDelay, pick, request } from './client';
import { listLists } from './lists';
import { toVisit, type VisitResponse } from './places';
import { flashcardToTango, type FlashcardResponse } from './tango';
import { copy } from '../copy';

// ---- Backend shapes (app/schemas/review.py) ----

interface JpOptionResponse {
  text: string;
  reading: string;
  romaji: string;
}

interface ExampleResponse {
  japanese: string;
  reading: string;
  english: string;
}

interface PhotoLayerResponse {
  image_url: string;
  box: { x: number; y: number; w: number; h: number };
  area: string;
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
    is_favorites?: boolean;
    is_list?: boolean;
  }[];
  exercise_types: { id: 'flashcard' | 'mcq' | 'fill'; enabled: boolean; count?: number }[];
  total_tango: number;
}

type ExerciseResponse =
  | {
      id: string;
      type: 'flashcard';
      question_type: 'flashcard_text' | 'flashcard_object';
      stage: ReviewStage;
      flashcard_id: string;
      photo: PhotoLayerResponse | null;
      front: JpOptionResponse | null;
      back: {
        text: string;
        reading: string;
        romaji: string;
        meaning: string;
        example: ExampleResponse | null;
      };
      place_hint: string;
      steps_to_stamp: number;
      promoted_to?: ReviewStage | null;
      demoted_to?: ReviewStage | null;
    }
  | {
      id: string;
      type: 'mcq';
      question_type:
        | 'mcq_text_reading'
        | 'mcq_text_translate'
        | 'mcq_text_reverse'
        | 'mcq_object_name';
      stage: ReviewStage;
      flashcard_id: string;
      photo: PhotoLayerResponse | null;
      prompt_kind: 'jp' | 'meaning' | 'photo';
      prompt: JpOptionResponse;
      meaning_prompt: string;
      options: (JpOptionResponse | string)[];
      answer_index: number;
      place_hint: string;
      example: ExampleResponse | null;
      steps_to_stamp: number;
      promoted_to?: ReviewStage | null;
      demoted_to?: ReviewStage | null;
    }
  | {
      id: string;
      type: 'fill';
      question_type:
        | 'fill_text_reading'
        | 'fill_text_translate'
        | 'fill_text_reverse'
        | 'fill_object_name';
      stage: ReviewStage;
      flashcard_id: string;
      photo: PhotoLayerResponse | null;
      prompt: JpOptionResponse;
      meaning_prompt: string;
      cloze: ExampleResponse | null;
      answer_kind: 'kana' | 'meaning';
      accepted_answers: string[];
      answer_display: string;
      place_hint: string;
      example: ExampleResponse | null;
      steps_to_stamp: number;
      promoted_to?: ReviewStage | null;
      demoted_to?: ReviewStage | null;
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
    strength_after: number;
  } | null;
  by_area: { area: string; count: number }[];
  next: VisitResponse | null;
}

/** One answer to a session question; the server grades it against the question as asked. */
export type SessionAnswerInput =
  | { kind: 'flip'; rating: 'again' | 'good' | 'easy' }
  | { kind: 'pick'; index: number }
  | { kind: 'typed'; text: string }
  | { kind: 'reveal' };

/** The server's grading of one answer. Stale: the card moved on, so it wasn't counted. */
export interface AnswerVerdict {
  exerciseId: string;
  correct: boolean;
  stale: boolean;
}

interface AnswerVerdictResponse {
  exercise_id: string;
  correct: boolean;
  stale: boolean;
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

function toExample(ex: ExampleResponse | null | undefined): (JpText & { en: string }) | undefined {
  if (!ex) {
    return undefined;
  }
  return {
    text: ex.japanese,
    reading: ex.reading,
    en: ex.english,
  };
}

function toPhoto(photo: PhotoLayerResponse | null | undefined): PhotoLayer | null {
  if (!photo) {
    return null;
  }
  return {
    imageUrl: photo.image_url || undefined,
    box: photo.box,
    area: photo.area,
  };
}

function toExercise(e: ExerciseResponse): Exercise {
  if (e.type === 'flashcard') {
    return {
      id: e.id,
      type: 'flashcard',
      questionType: e.question_type,
      stage: e.stage,
      tangoId: e.flashcard_id,
      photo: toPhoto(e.photo),
      front: e.front ? toJp(e.front) : null,
      back: {
        text: e.back.text,
        reading: e.back.reading,
        romaji: e.back.romaji,
        meaning: e.back.meaning,
        example: toExample(e.back.example),
      },
      placeHint: e.place_hint,
      nextStep: copy.reviewSession.stepsToStamp(e.steps_to_stamp),
      promotedTo: e.promoted_to ?? null,
      demotedTo: e.demoted_to ?? null,
    };
  }
  if (e.type === 'mcq') {
    return {
      id: e.id,
      type: 'mcq',
      questionType: e.question_type,
      stage: e.stage,
      tangoId: e.flashcard_id,
      photo: toPhoto(e.photo),
      promptKind: e.prompt_kind,
      prompt: toJp(e.prompt),
      meaningPrompt: e.meaning_prompt,
      options: e.options.map(opt => (typeof opt === 'string' ? opt : toJp(opt))),
      answerIndex: e.answer_index,
      placeHint: e.place_hint,
      example: toExample(e.example),
      nextStep: copy.reviewSession.stepsToStamp(e.steps_to_stamp),
      promotedTo: e.promoted_to ?? null,
      demotedTo: e.demoted_to ?? null,
    };
  }
  return {
    id: e.id,
    type: 'fill',
    questionType: e.question_type,
    stage: e.stage,
    tangoId: e.flashcard_id,
    photo: toPhoto(e.photo),
    prompt: toJp(e.prompt),
    meaningPrompt: e.meaning_prompt,
    cloze: toExample(e.cloze),
    answerKind: e.answer_kind,
    acceptedAnswers: e.accepted_answers,
    answerDisplay: e.answer_display,
    placeHint: e.place_hint,
    example: toExample(e.example),
    nextStep: copy.reviewSession.stepsToStamp(e.steps_to_stamp),
    promotedTo: e.promoted_to ?? null,
    demotedTo: e.demoted_to ?? null,
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
  // Mock: the sample summary plus Favourites and lists made this session.
  async () => {
    const lists = await listLists();
    const favorites = ALL_TANGO.filter(t => t.favorite).length;
    return mockDelay<ReviewSummary>({
      ...REVIEW_SUMMARY,
      collections: [
        ...(favorites
          ? [
              {
                id: 'favorites',
                label: 'Favourites',
                count: favorites,
                isPlace: false,
                isPlaceCue: false,
                isFavorites: true,
              },
            ]
          : []),
        ...REVIEW_SUMMARY.collections,
        ...lists.map(l => ({
          id: `list:${l.id}`,
          label: l.name,
          count: l.tangoIds.length,
          isPlace: false,
          isPlaceCue: false,
          isList: true,
        })),
      ],
    });
  },
  async () => {
    const r = await request<ReviewSummaryResponse>(`${API_V1}/review/summary`);
    return {
      dueCount: r.due_count,
      minutes: r.minutes,
      placeCueCount: r.place_cue_count,
      collections: r.collections.map(c => ({
        id: c.id,
        label: c.is_favorites
          ? copy.review.favourites
          : c.is_place_cue
          ? copy.review.placeCue
          : c.label,
        count: c.count,
        isPlace: c.is_place,
        isPlaceCue: c.is_place_cue,
        isFavorites: c.is_favorites ?? false,
        isList: c.is_list ?? false,
      })),
      exerciseTypes: r.exercise_types.map(t => ({
        ...t,
        label: copy.reviewLabels.stages[t.id],
      })),
      totalTango: r.total_tango,
    };
  },
);

/** Starts a session: up to 10 Tango, weakest first. */
export const getReviewSession = pick(
  'review',
  (_collectionId?: string, _language?: string) =>
    mockDelay<ReviewSession>({ sessionId: null, exercises: SESSION }, 400),
  async (collectionId?: string, language?: string) => {
    const r = await request<ReviewSessionResponse>(`${API_V1}/review/session`, {
      query: { collection: collectionId, language },
    });
    return { sessionId: r.session_id, exercises: r.exercises.map(toExercise) };
  },
);

/**
 * Records one session answer (POST /review/session/{id}/answers) and returns the
 * server's verdict. Mock sessions have no id, so there is nothing to record.
 */
export const submitAnswer = pick(
  'review',
  (
    _sessionId: string | null,
    _exerciseId: string,
    _answer: SessionAnswerInput,
  ) => mockDelay<AnswerVerdict | null>(null, 100),
  async (
    sessionId: string | null,
    exerciseId: string,
    answer: SessionAnswerInput,
  ): Promise<AnswerVerdict | null> => {
    if (!sessionId) {
      return null;
    }
    const r = await request<AnswerVerdictResponse>(
      `${API_V1}/review/session/${encodeURIComponent(sessionId)}/answers`,
      { method: 'POST', body: { exercise_id: exerciseId, ...answer } },
    );
    return { exerciseId: r.exercise_id, correct: r.correct, stale: r.stale };
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
            title: copy.sessionResults.winTitle(r.biggest_win.strength_after >= 4),
            detail: copy.sessionResults.winDetail(r.biggest_win.strength_after),
          }
        : null,
      byArea: r.by_area,
      next: r.next ? toVisit(r.next) : null,
    };
  },
);
