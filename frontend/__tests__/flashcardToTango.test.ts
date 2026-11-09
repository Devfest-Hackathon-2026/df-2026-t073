import { flashcardToTango, type FlashcardResponse } from '../src/api/tango';

function response(
  overrides: Partial<FlashcardResponse['review_stats']>,
  strength: number,
): FlashcardResponse {
  return {
    flashcard_id: 'fc_1',
    capture_id: '',
    item_id: null,
    image_url: '',
    bounding_box: [],
    kanji: '食券',
    reading: 'しょっけん',
    romaji: 'shokken',
    meaning: 'meal ticket',
    part_of_speech: 'Noun',
    kind: 'word',
    capture_format: 'text',
    use_cases: [],
    related_vocab: [],
    review_stats: {
      review_count: 0,
      last_reviewed_at: null,
      next_review_at: '2026-11-01T00:00:00Z',
      mastered: false,
      stage: 'flashcard',
      ...overrides,
    },
    created_at: '2026-11-01T00:00:00Z',
    strength,
    sightings: [],
    history: [],
  };
}

describe('flashcardToTango', () => {
  test("uses the server's stage, not one guessed from strength", () => {
    // Strength 3 without a photo would have been guessed as "mcq".
    expect(flashcardToTango(response({ stage: 'fill' }, 3)).stage).toBe('fill');
    expect(flashcardToTango(response({ stage: 'mcq_photo' }, 2)).stage).toBe(
      'mcq_photo',
    );
  });
});
