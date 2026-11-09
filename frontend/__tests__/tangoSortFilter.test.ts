import {
  pageNumbers,
  sortFilterTango,
  tangoPlaces,
} from '../src/features/tango/sortFilter';
import type { Strength, Tango } from '../src/types';

function tango(
  id: string,
  reading: string,
  strength: Strength,
  extra: Partial<Tango> = {},
): Tango {
  return {
    id,
    kind: 'object',
    text: reading,
    reading,
    romaji: '',
    meaning: '',
    sightings: [],
    strength,
    known: strength === 4,
    history: [],
    examples: [],
    stage: 'flashcard',
    ...extra,
  } as Tango;
}

// Newest first, as the server sends them.
const LIST = [
  tango('c', 'かぎ', 1, { favorite: true }),
  tango('b', 'あめ', 4),
  tango('a', 'うみ', 2),
];
const ids = (list: Tango[]) => list.map(t => t.id);

test('filters keep favorites, learning or stamped Tango', () => {
  expect(ids(sortFilterTango(LIST, 'all', 'newest'))).toEqual(['c', 'b', 'a']);
  expect(ids(sortFilterTango(LIST, 'favorites', 'newest'))).toEqual(['c']);
  expect(ids(sortFilterTango(LIST, 'learning', 'newest'))).toEqual(['c', 'a']);
  expect(ids(sortFilterTango(LIST, 'stamped', 'newest'))).toEqual(['b']);
});

test('sorts by age, strength or reading', () => {
  expect(ids(sortFilterTango(LIST, 'all', 'oldest'))).toEqual(['a', 'b', 'c']);
  expect(ids(sortFilterTango(LIST, 'all', 'weakest'))).toEqual(['c', 'a', 'b']);
  expect(ids(sortFilterTango(LIST, 'all', 'strongest'))).toEqual([
    'b',
    'a',
    'c',
  ]);
  expect(ids(sortFilterTango(LIST, 'all', 'az'))).toEqual(['b', 'a', 'c']);
});

test('narrows to a place or a list, and lists the places', () => {
  const seen = (placeId: string, placeName: string) => ({
    placeId,
    placeName,
    lat: null,
    lng: null,
    seenAt: '2026-11-01T00:00:00Z',
  });
  const list = [
    tango('c', 'かぎ', 1, { sightings: [seen('p1', 'Station')] }),
    tango('b', 'あめ', 2, {
      sightings: [seen('p1', 'Station'), seen('p2', 'Cafe')],
    }),
    tango('a', 'うみ', 2),
  ];
  expect(
    ids(sortFilterTango(list, 'all', 'newest', { placeId: 'p2' })),
  ).toEqual(['b']);
  expect(
    ids(sortFilterTango(list, 'all', 'newest', { listTangoIds: ['a', 'c'] })),
  ).toEqual(['c', 'a']);
  expect(
    ids(
      sortFilterTango(list, 'all', 'newest', {
        placeId: 'p1',
        listTangoIds: ['b'],
      }),
    ),
  ).toEqual(['b']);
  expect(tangoPlaces(list)).toEqual([
    { id: 'p1', name: 'Station', count: 2 },
    { id: 'p2', name: 'Cafe', count: 1 },
  ]);
});

test('page numbers show the ends and the pages around the current one', () => {
  expect(pageNumbers(1, 1)).toEqual([1]);
  expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
  expect(pageNumbers(1, 10)).toEqual([1, 2, 'gap', 10]);
  expect(pageNumbers(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
  expect(pageNumbers(3, 10)).toEqual([1, 2, 3, 4, 'gap', 10]);
  expect(pageNumbers(10, 10)).toEqual([1, 'gap', 9, 10]);
});
