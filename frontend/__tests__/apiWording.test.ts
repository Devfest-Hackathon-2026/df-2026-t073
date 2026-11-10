// The backend sends data; the API adapters word it with src/copy.ts.
import { getToday } from '../src/api/places';
import {
  getReviewSession,
  getReviewSummary,
  getSessionResult,
} from '../src/api/review';
import { request } from '../src/api/client';
import { copy } from '../src/copy';

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
    'Hana Stamp earned',
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
  expect(stamp.biggestWin?.detail).toBe('Hana Stamp earned');
  respond(result(3));
  const stronger = await getSessionResult('rs');
  expect(stronger.biggestWin?.detail).toBe('1 to Stamp');
});

test('the next planned visit comes from the server, with its real time', async () => {
  respond({
    reviewed: 1,
    minutes: 1,
    biggest_win: null,
    by_area: [],
    next: {
      visit_id: 'v1',
      place: {
        id: 'nakano-ward-office',
        name: { text: '中野区役所', meaning: 'Nakano Ward Office' },
        category: 'Ward office',
        area: 'Nakano',
        lat: 35.7,
        lng: 139.66,
        address: '',
      },
      when: '2026-11-12T10:00:00+09:00',
      tango_count: 6,
    },
  });
  const r = await getSessionResult('rs');
  expect(r.next?.place.id).toBe('nakano-ward-office');
  expect(r.next?.when).toBe('2026-11-12T10:00:00+09:00');

  respond({
    reviewed: 0,
    minutes: 0,
    biggest_win: null,
    by_area: [],
    next: null,
  });
  expect((await getSessionResult('rs')).next).toBeNull();
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
    'Favorites',
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
  expect(t.pins.map(p => p.placeId)).toEqual([undefined, undefined]);
  expect(t.wordOfDay?.reason).toBe(copy.today.wordReason.visit('麺屋たいき'));
  // Older servers leave the flag out: not rehearsed yet.
  expect(t.rehearsedOnce).toBe(false);

  respond(today({ kind: 'topic', place_name: null, topic: 'transport' }));
  expect((await getToday()).wordOfDay?.reason).toBe(
    copy.today.wordReason.topic('transport'),
  );

  respond(today({ kind: 'everyday', place_name: null, topic: null }));
  // A general word: no reason line.
  expect((await getToday()).wordOfDay?.reason).toBe('');

  respond({
    ...today({ kind: 'everyday', place_name: null, topic: null }),
    rehearsed_once: true,
  });
  expect((await getToday()).rehearsedOnce).toBe(true);
});

test('favorite pins keep the place they open', async () => {
  respond({
    user_name: 'Ari',
    up_next: null,
    pins: [
      {
        id: 'fav-menya-taiki',
        label: '麺屋たいき',
        count: 0,
        lat: 0,
        lng: 0,
        kind: 'favorite',
        area_id: null,
        stars: 0,
        place_id: 'menya-taiki',
      },
    ],
    areas: [],
    starter_tango: [],
    word_of_day: null,
  });
  const [pin] = (await getToday()).pins;
  expect(pin.kind).toBe('favorite');
  expect(pin.placeId).toBe('menya-taiki');
  expect(pin.label).toBe('麺屋たいき');
});

test('time until the next session reads naturally', () => {
  const { formatTimeUntil } = require('../src/utils/format');
  const now = Date.parse('2026-11-09T12:00:00Z');
  const at = (ms: number) => new Date(now + ms).toISOString();
  expect(formatTimeUntil(at(30_000), now)).toBe('a minute');
  expect(formatTimeUntil(at(25 * 60_000), now)).toBe('25 minutes');
  expect(formatTimeUntil(at(60 * 60_000), now)).toBe('an hour');
  expect(formatTimeUntil(at(3.2 * 3_600_000), now)).toBe('3 hours');
  expect(formatTimeUntil(at(2 * 86_400_000), now)).toBe('2 days');
  expect(formatTimeUntil(at(-1000), now)).toBeNull();
});
