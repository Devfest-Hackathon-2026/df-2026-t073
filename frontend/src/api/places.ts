import { MAP_PINS, PLACES, USER_NAME, VISITS } from '../mocks/places';
import { TANGO } from '../mocks/tango';
import { STARTER_TANGO } from '../mocks/user';
import type { Coords } from '../location/location';
import type { JpText, MapArea, Place, TodaySummary, Visit } from '../types';
import { API_V1, mockDelay, pick, request } from './client';
import { flashcardToTango, type FlashcardResponse } from './tango';
import { toReviewCard, type ReviewCardResponse } from './review';
import { clearCache, setCache } from '../cache/storage';
import { copy } from '../copy';

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

// ---- Backend shapes (backend/app/schemas/place.py) ----

interface JpNameResponse {
  text: string;
  reading: string | null;
  romaji: string | null;
  meaning: string | null;
}

export interface PlaceResponse {
  id: string;
  name: JpNameResponse;
  category: string;
  area: string;
  lat: number;
  lng: number;
  address: string;
}

export interface VisitResponse {
  visit_id: string;
  place: PlaceResponse;
  when: string;
  tango_count: number;
}

interface TodayResponse {
  user_name: string;
  up_next: VisitResponse | null;
  pins: {
    id: string;
    label: string;
    count: number;
    lat: number;
    lng: number;
    kind: 'tango' | 'next' | 'favorite';
    area_id: string | null;
    stars: number;
    place_id?: string | null;
  }[];
  areas: {
    id: string;
    name: string;
    tango_count: number;
    place_count: number;
    sample: FlashcardResponse[];
    more_count: number;
    plan_place_id: string | null;
  }[];
  starter_tango: JpNameResponse[];
  word_of_day?: {
    text: string;
    reading: string;
    romaji: string;
    meaning: string;
    reason: {
      kind: 'visit' | 'topic' | 'everyday';
      place_name: string | null;
      topic: string | null;
    };
  } | null;
  review_card?: ReviewCardResponse | null;
  total_tango?: number;
}

/** Why this word of the day was picked, in words; "" for a general word. */
function wordReason(reason: {
  kind: 'visit' | 'topic' | 'everyday';
  place_name: string | null;
  topic: string | null;
}): string {
  if (reason.kind === 'visit' && reason.place_name) {
    return copy.today.wordReason.visit(reason.place_name);
  }
  if (reason.kind === 'topic' && reason.topic) {
    return copy.today.wordReason.topic(reason.topic);
  }
  return '';
}

function toJp(n: JpNameResponse): JpText {
  return {
    text: n.text,
    reading: n.reading ?? undefined,
    romaji: n.romaji ?? undefined,
    meaning: n.meaning ?? undefined,
  };
}

export function toPlace(p: PlaceResponse): Place {
  return {
    id: p.id,
    name: toJp(p.name),
    category: p.category,
    area: p.area,
    lat: p.lat,
    lng: p.lng,
    address: p.address || undefined,
  };
}

export function toVisit(v: VisitResponse): Visit {
  return {
    id: v.visit_id,
    place: toPlace(v.place),
    when: v.when,
    tangoCount: v.tango_count,
  };
}

// ---- API ----

// Today screen: greeting, map pins and areas, next visit, day-one starter Tango.
export const getToday = pick(
  'places',
  () =>
    mockDelay<TodaySummary>({
      userName: USER_NAME,
      upNext: VISITS[0],
      pins: [...MAP_PINS, ...mockFavoritePins()],
      areas: MAP_AREAS,
      starterTango: STARTER_TANGO,
      wordOfDay: {
        text: '食券',
        reading: 'しょっけん',
        romaji: 'shokken',
        meaning: 'meal ticket',
        reason: 'For your visit to 麺屋たいき',
      },
    }),
  async (): Promise<TodaySummary> => {
    const r = await request<TodayResponse>(`${API_V1}/today`);
    const reviewCard = r.review_card ? toReviewCard(r.review_card) : null;
    if (reviewCard) {
      setCache('review:card', reviewCard).catch(() => {});
    }
    return {
      userName: r.user_name,
      upNext: r.up_next ? toVisit(r.up_next) : null,
      pins: r.pins.map(p => ({
        id: p.id,
        label: p.kind === 'next' ? copy.map.upNext : p.label,
        count: p.count,
        x: 0.5,
        y: 0.5,
        lat: p.lat,
        lng: p.lng,
        kind: p.kind,
        areaId: p.area_id ?? undefined,
        stars: p.stars,
        placeId: p.place_id ?? undefined,
      })),
      areas: r.areas.map(a => ({
        id: a.id,
        label: copy.map.around(a.name),
        tangoCount: a.tango_count,
        placeCount: a.place_count,
        sample: a.sample.map(flashcardToTango),
        moreCount: a.more_count,
        planPlaceId: a.plan_place_id,
      })),
      starterTango: r.starter_tango.map(toJp),
      wordOfDay: r.word_of_day
        ? { ...r.word_of_day, reason: wordReason(r.word_of_day.reason) }
        : null,
      reviewCard,
      totalTango: r.total_tango ?? 0,
    };
  },
);

/** Place search (Google Places on the backend). Results near `near` come first. */
export const searchPlaces = pick(
  'places',
  (query: string, _near?: Coords | null) => {
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
  async (query: string, near?: Coords | null) => {
    if (!query.trim()) {
      return [];
    }
    const places = await request<PlaceResponse[]>(`${API_V1}/places/search`, {
      query: { q: query, lat: near?.lat, lng: near?.lng },
    });
    return places.map(toPlace);
  },
);

export const getPlace = pick(
  'places',
  (placeId: string) =>
    mockDelay<Place>(PLACES[placeId] ?? PLACES['menya-taiki']),
  async (placeId: string) =>
    toPlace(
      await request<PlaceResponse>(
        `${API_V1}/places/${encodeURIComponent(placeId)}`,
      ),
    ),
);

// ---- Favorite places ----

/** Mock mode: favorites live in memory for the session. */
const MOCK_FAVORITES = new Set<string>();

function mockFavoritePins(): TodaySummary['pins'] {
  return [...MOCK_FAVORITES]
    .map(id => PLACES[id])
    .filter(Boolean)
    .map(p => ({
      id: `fav-${p.id}`,
      label: p.name.text,
      count: 0,
      x: 0.5,
      y: 0.5,
      lat: p.lat,
      lng: p.lng,
      kind: 'favorite' as const,
      placeId: p.id,
    }));
}

/** GET /me/favorite-places: the user's favorite places, newest first. */
export const listFavoritePlaces = pick(
  'places',
  () =>
    mockDelay<Place[]>(
      [...MOCK_FAVORITES].map(id => PLACES[id]).filter(Boolean),
    ),
  async () =>
    (await request<PlaceResponse[]>(`${API_V1}/me/favorite-places`)).map(
      toPlace,
    ),
);

/** PUT /me/favorite-places/{id} */
export const addFavoritePlace = pick(
  'places',
  (placeId: string) => {
    MOCK_FAVORITES.add(placeId);
    return mockDelay<void>(undefined, 100);
  },
  async (placeId: string) => {
    await request<PlaceResponse>(
      `${API_V1}/me/favorite-places/${encodeURIComponent(placeId)}`,
      { method: 'PUT' },
    );
  },
);

/** DELETE /me/favorite-places/{id} */
export const removeFavoritePlace = pick(
  'places',
  (placeId: string) => {
    MOCK_FAVORITES.delete(placeId);
    return mockDelay<void>(undefined, 100);
  },
  async (placeId: string) => {
    await request<void>(
      `${API_V1}/me/favorite-places/${encodeURIComponent(placeId)}`,
      { method: 'DELETE' },
    );
  },
);

export const listVisits = pick(
  'places',
  () => mockDelay<Visit[]>(VISITS),
  async () => (await request<VisitResponse[]>(`${API_V1}/visits`)).map(toVisit),
);

export const createVisit = pick(
  'places',
  (placeId: string, when: string) => {
    const visit: Visit = {
      id: `visit-${Date.now()}`,
      place: PLACES[placeId] ?? PLACES['menya-taiki'],
      when,
      tangoCount: 0,
    };
    VISITS.push(visit);
    return mockDelay<Visit>(visit);
  },
  async (placeId: string, when: string) => {
    const res = await request<VisitResponse>(`${API_V1}/visits`, {
      method: 'POST',
      body: { place_id: placeId, when },
    });
    await Promise.all([clearCache('visits:'), clearCache('today:')]);
    return toVisit(res);
  },
);

export const deleteVisit = pick(
  'places',
  (visitId: string) => {
    const index = VISITS.findIndex(v => v.id === visitId);
    if (index >= 0) {
      VISITS.splice(index, 1);
    }
    return mockDelay<void>(undefined, 100);
  },
  async (visitId: string) => {
    await request<void>(`${API_V1}/visits/${encodeURIComponent(visitId)}`, {
      method: 'DELETE',
    });
    await Promise.all([clearCache('visits:'), clearCache('today:')]);
  },
);
