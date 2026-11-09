// The backend sends data; the API adapters word it with src/copy.ts.
import { getToday } from '../src/api/places';
import {
  getReviewSession,
  getReviewSummary,
  getSessionResult,
} from '../src/api/review';
import { request } from '../src/api/client';

// Use the real adapters (not the mocks) and answer each request with a fixture.
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  pick: (_area: string, _mock: unknown, real: unknown) => real,
  request: jest.fn(),
}));

const requestMock = request as jest.MockedFunction<typeof request>;
const respond = (body: unknown) => requestMock.mockResolvedValueOnce(body);

const flashcardExercise = (stepsToStamp: number) => ({
  id: 'rs-0',
  type: 'flashcard',
  question_type: 'flashcard_text',
  stage: 'flashcard',
  flashcard_id: 'fc_1',
  photo: null,
  front: { text: '食券', reading: 'しょっけん', romaji: 'shokken' },
  back: {
    text: '食券',
    reading: 'しょっけん',
    romaji: 'shokken',
    meaning: 'meal ticket',
  },
  place_hint: 'Koenji',
  steps_to_stamp: stepsToStamp,
});

beforeEach(() => requestMock.mockReset());

test('steps to a Stamp become the next-step label', async () => {
  respond({
    session_id: 'rs',
    exercises: [flashcardExercise(2), flashcardExercise(0)],
  });
  const s = await getReviewSession();
  expect(s.exercises.map(e => e.nextStep)).toEqual([
    '2 to Stamp',
    'Stamp earned',
  ]);
});

test('the biggest win is worded from the strength after the answer', async () => {
  const result = (strengthAfter: number) => ({
    reviewed: 1,
    minutes: 1,
    biggest_win: {
      flashcard_id: 'fc_1',
      tango: { text: '食券', reading: 'しょっけん', romaji: 'shokken' },
      meaning: 'meal ticket',
      strength_after: strengthAfter,
    },
    by_area: [],
    next: null,
  });
  respond(result(4));
  const stamp = await getSessionResult('rs');
  expect(stamp.biggestWin?.title).toBe('is now a star');
  expect(stamp.biggestWin?.detail).toBe(
    "Full strength. It's a star on your map now.",
  );
  respond(result(3));
  const stronger = await getSessionResult('rs');
  expect(stronger.biggestWin?.title).toBe('is getting stronger');
  expect(stronger.biggestWin?.detail).toBe(
    'Strength 3 of 4. 1 more to make it a star.',
  );
});

test('built-in collections and exercise types are named by the app', async () => {
  respond({
    due_count: 0,
    minutes: 0,
    place_cue_count: 0,
    collections: [
      {
        id: 'favorites',
        label: '',
        count: 2,
        is_place: false,
        is_place_cue: false,
        is_favorites: true,
      },
      {
        id: 'place-cue',
        label: '',
        count: 1,
        is_place: false,
        is_place_cue: true,
      },
      {
        id: 'place:Koenji',
        label: 'Koenji',
        count: 3,
        is_place: true,
        is_place_cue: false,
      },
    ],
    exercise_types: [
      { id: 'flashcard', enabled: true, count: 1 },
      { id: 'mcq', enabled: true, count: 2 },
      { id: 'fill', enabled: true, count: 3 },
    ],
    total_tango: 6,
  });
  const summary = await getReviewSummary();
  expect(summary.collections.map(c => c.label)).toEqual([
    'Favourites',
    'Place cue',
    'Koenji',
  ]);
  expect(summary.exerciseTypes.map(t => t.label)).toEqual([
    'Flashcard',
    'Multiple choice',
    'Fill in the blank',
  ]);
});

test('Today words areas, the next-visit pin and the word-of-day reason', async () => {
  const today = (reason: unknown) => ({
    user_name: 'Ari',
    up_next: null,
    pins: [
      {
        id: 'pin-koenji',
        label: 'Koenji',
        count: 2,
        lat: 0,
        lng: 0,
        kind: 'tango',
        area_id: 'koenji',
        stars: 0,
      },
      {
        id: 'pin-next',
        label: '麺屋たいき',
        count: 0,
        lat: 0,
        lng: 0,
        kind: 'next',
        area_id: null,
        stars: 0,
      },
    ],
    areas: [
      {
        id: 'koenji',
        name: 'Koenji',
        tango_count: 2,
        place_count: 1,
        sample: [],
        more_count: 0,
        plan_place_id: null,
      },
    ],
    starter_tango: [],
    word_of_day: {
      text: '食券',
      reading: 'しょっけん',
      romaji: 'shokken',
      meaning: 'meal ticket',
      reason,
    },
  });

  respond(today({ kind: 'visit', place_name: '麺屋たいき', topic: null }));
  const t = await getToday();
  expect(t.areas[0].label).toBe('Around Koenji');
  expect(t.pins.map(p => p.label)).toEqual(['Koenji', 'Up next']);
  expect(t.wordOfDay?.reason).toBe('For your visit to 麺屋たいき');

  respond(today({ kind: 'topic', place_name: null, topic: 'transport' }));
  expect((await getToday()).wordOfDay?.reason).toBe(
    "You've been catching train and bus words",
  );

  respond(today({ kind: 'everyday', place_name: null, topic: null }));
  expect((await getToday()).wordOfDay?.reason).toBe(
    'An everyday word for your level',
  );
});
