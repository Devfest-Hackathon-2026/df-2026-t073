import {
  REVIEW_CARD,
  REVIEW_SUMMARY,
  SESSION,
  SESSION_RESULT,
} from '../mocks/review';
import type {
  Exercise,
  ReviewCard,
  ReviewSummary,
  SessionResult,
} from '../types';
import { API_V1, mockDelay, pick, request } from './client';

/** Small review card on Today. */
export const getReviewCard = pick(
  () => mockDelay<ReviewCard>(REVIEW_CARD),
  // TODO confirm endpoint with backend
  () => request<ReviewCard>(`${API_V1}/review/card`),
);

export const getReviewSummary = pick(
  () => mockDelay<ReviewSummary>(REVIEW_SUMMARY),
  // TODO confirm endpoint with backend
  () => request<ReviewSummary>(`${API_V1}/review/summary`),
);

export const getReviewSession = pick(
  (_collectionId?: string) => {
    return mockDelay<Exercise[]>(SESSION, 400);
  },
  // TODO confirm endpoint with backend
  (collectionId?: string) =>
    request<Exercise[]>(`${API_V1}/review/session`, {
      query: { collection: collectionId },
    }),
);

export const submitAnswer = pick(
  (_tangoId: string, _correct: boolean) => {
    return mockDelay<void>(undefined, 100);
  },
  // Existing endpoint: POST /api/v1/flashcards/{flashcard_id}/review
  (tangoId: string, correct: boolean) =>
    request<void>(`${API_V1}/flashcards/${encodeURIComponent(tangoId)}/review`, {
      method: 'POST',
      body: { rating: correct ? 'good' : 'again' },
    }),
);

export const getSessionResult = pick(
  () => mockDelay<SessionResult>(SESSION_RESULT, 400),
  // TODO confirm endpoint with backend
  () => request<SessionResult>(`${API_V1}/review/session/result`),
);
