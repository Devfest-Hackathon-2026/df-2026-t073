import { SESSION } from '../src/mocks/review';
import { flashcardToast } from '../src/screens/review/ReviewSessionScreen';
import type { FlashcardExercise } from '../src/types';

const base = SESSION[0] as FlashcardExercise;
const card = (overrides: Partial<FlashcardExercise>): FlashcardExercise => ({
  ...base,
  ...overrides,
});

describe('flashcardToast', () => {
  test('a good or easy rating that promotes says level up, with a check', () => {
    const t = flashcardToast(card({ promotedTo: 'mcq' }), 'good');
    expect(t).toEqual({
      exerciseId: base.id,
      icon: 'done',
      text: `Level up for ${base.back.text}!`,
    });
    expect(flashcardToast(card({ promotedTo: 'mcq' }), 'easy').icon).toBe(
      'done',
    );
  });

  test('a good rating without a promotion says it is getting stronger', () => {
    expect(flashcardToast(card({ promotedTo: null }), 'good').text).toBe(
      `${base.back.text} is getting stronger`,
    );
  });

  test('again shows a triangle, not a cross', () => {
    const demoted = flashcardToast(card({ demotedTo: 'flashcard' }), 'again');
    expect(demoted.icon).toBe('triangle');
    expect(demoted.text).toBe(`Back a step for ${base.back.text}`);
    expect(flashcardToast(card({ demotedTo: null }), 'again').text).toBe(
      `${base.back.text} will come back soon`,
    );
  });

  test('never names the stage', () => {
    for (const rating of ['again', 'good', 'easy'] as const) {
      const { text } = flashcardToast(
        card({ promotedTo: 'mcq_photo', demotedTo: 'flashcard' }),
        rating,
      );
      expect(text).not.toMatch(/Photo MCQ|Multiple choice|Flashcard|Fill/);
    }
  });
});
