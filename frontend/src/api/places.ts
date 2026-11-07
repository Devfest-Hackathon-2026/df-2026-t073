import { MAP_PINS, PLACES, USER_NAME, VISITS } from '../mocks/places';
import { TANGO } from '../mocks/tango';
import { STARTER_TANGO } from '../mocks/user';
import type { MapArea, Place, TodaySummary, Visit } from '../types';
import { API_V1, mockDelay, pick, request } from './client';

const MAP_AREAS: MapArea[] = [
  {
    id: 'koenji',
    label: 'Around Koenji',
    tangoCount: 12,
    placeCount: 4,
    sample: [
      TANGO.kaedama,
      TANGO.shokken,
      TANGO['churin-kinshi'],
      TANGO.oomori,
    ],
    moreCount: 8,
    planPlaceId: 'menya-taiki',
  },
  {
    id: 'nakano',
    label: 'Around Nakano',
    tangoCount: 9,
    placeCount: 3,
    sample: [TANGO.hangaku, TANGO.bento, TANGO['mikiri-hin']],
    moreCount: 6,
    planPlaceId: 'nakano-ward-office',
  },
  {
    id: 'asagaya',
    label: 'Around Asagaya',
    tangoCount: 6,
    placeCount: 2,
    sample: [TANGO.igai, TANGO['tachiiri-kinshi']],
    moreCount: 4,
    planPlaceId: 'asagaya-pearl',
  },
];

// Today screen: greeting, map pins and areas, next visit, day-one starter Tango.
export const getToday = pick(
  'places',
  () =>
    mockDelay<TodaySummary>({
      userName: USER_NAME,
      upNext: VISITS[0],
      pins: MAP_PINS,
      areas: MAP_AREAS,
      starterTango: STARTER_TANGO,
    }),
  // TODO confirm endpoint with backend
  () => request<TodaySummary>(`${API_V1}/today`),
);

export const searchPlaces = pick(
  'places',
  (query: string) => {
    const q = query.trim().toLowerCase();
    const results = Object.values(PLACES).filter(
      place =>
        q.length > 0 &&
        [place.name.text, place.name.meaning ?? '', place.area, place.category]
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
    return mockDelay<Place[]>(results, 200);
  },
  // TODO confirm endpoint with backend (Google Maps Places search, proxied by the backend)
  (query: string) =>
    request<Place[]>(`${API_V1}/places/search`, { query: { q: query } }),
);

export const getPlace = pick(
  'places',
  (placeId: string) =>
    mockDelay<Place>(PLACES[placeId] ?? PLACES['menya-taiki']),
  // TODO confirm endpoint with backend
  (placeId: string) =>
    request<Place>(`${API_V1}/places/${encodeURIComponent(placeId)}`),
);

export const listVisits = pick(
  'places',
  () => mockDelay<Visit[]>(VISITS),
  // TODO confirm endpoint with backend
  () => request<Visit[]>(`${API_V1}/visits`),
);

export const createVisit = pick(
  'places',
  (placeId: string, when: string) =>
    mockDelay<Visit>({
      id: `visit-${Date.now()}`,
      place: PLACES[placeId] ?? PLACES['menya-taiki'],
      when,
      tangoCount: 0,
    }),
  // TODO confirm endpoint with backend
  (placeId: string, when: string) =>
    request<Visit>(`${API_V1}/visits`, {
      method: 'POST',
      body: { placeId, when },
    }),
);
