import { collectionTango } from '../src/features/review/collectionTango';
import type { Collection, Tango } from '../src/types';

const seen = (placeName: string, seenAt: string) => ({
  placeId: placeName,
  placeName,
  lat: null,
  lng: null,
  seenAt,
});
const tango = (id: string, extra: Partial<Tango> = {}) =>
  ({ id, sightings: [], ...extra } as unknown as Tango);
const collection = (id: string, extra: Partial<Collection> = {}) => ({
  id,
  label: id,
  count: 0,
  isPlace: false,
  isPlaceCue: false,
  ...extra,
});

const ALL = [
  tango('a', {
    favorite: true,
    sightings: [seen('Cafe', '2026-11-01T00:00:00Z')],
  }),
  // Last seen at the Station, so only in the Station collection.
  tango('b', {
    sightings: [
      seen('Cafe', '2026-11-01T00:00:00Z'),
      seen('Station', '2026-11-02T00:00:00Z'),
    ],
  }),
  tango('c'),
];
const ids = (list: Tango[] | null) => list?.map(t => t.id);

test('each collection lists its Tango like the server does', () => {
  const lists = [{ id: 'l1', name: 'Mine', tangoIds: ['c', 'a'] }];
  expect(
    ids(
      collectionTango(
        collection('favorites', { isFavorites: true }),
        ALL,
        lists,
      ),
    ),
  ).toEqual(['a']);
  expect(
    ids(
      collectionTango(collection('place:Cafe', { isPlace: true }), ALL, lists),
    ),
  ).toEqual(['a']);
  expect(
    ids(
      collectionTango(
        collection('place:Station', { isPlace: true }),
        ALL,
        lists,
      ),
    ),
  ).toEqual(['b']);
  expect(
    ids(collectionTango(collection('list:l1', { isList: true }), ALL, lists)),
  ).toEqual(['a', 'c']);
  // Place cue holds whatever is due now: only the server knows.
  expect(
    collectionTango(collection('place-cue', { isPlaceCue: true }), ALL, lists),
  ).toBeNull();
});
