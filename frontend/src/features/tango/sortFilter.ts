import type { Tango } from '../../types';

/** Narrows to one place, one list, or text search; all optional. */
export interface TangoScope {
  placeId?: string | null;
  /** Ids of the Tango in the chosen list. */
  listTangoIds?: string[] | null;
  query?: string | null;
}

function matches(tango: Tango, query?: string | null): boolean {
  if (!query) {
    return true;
  }
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [
    tango.text,
    tango.reading,
    tango.romaji,
    tango.meaning,
    ...tango.sightings.map(s => s.placeName),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

/** The places the Tango were seen at, most Tango first. */
export function tangoPlaces(
  list: Tango[],
): { id: string; name: string; count: number }[] {
  const places = new Map<string, { id: string; name: string; count: number }>();
  for (const tango of list) {
    // Count each place once per Tango.
    const seen = new Set<string>();
    for (const s of tango.sightings) {
      if (!s.placeId || seen.has(s.placeId)) {
        continue;
      }
      seen.add(s.placeId);
      const place = places.get(s.placeId) ?? {
        id: s.placeId,
        name: s.placeName,
        count: 0,
      };
      place.count++;
      places.set(s.placeId, place);
    }
  }
  return [...places.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

export type TangoFilter = 'all' | 'favorites' | 'learning' | 'stamped';
export type TangoSort = 'newest' | 'oldest' | 'weakest' | 'strongest' | 'az';

export const TANGO_FILTERS: TangoFilter[] = [
  'all',
  'favorites',
  'learning',
  'stamped',
];
export const TANGO_SORTS: TangoSort[] = [
  'newest',
  'oldest',
  'weakest',
  'strongest',
  'az',
];

function keep(tango: Tango, filter: TangoFilter): boolean {
  switch (filter) {
    case 'favorites':
      return !!tango.favorite;
    case 'learning':
      return !tango.known;
    case 'stamped':
      return tango.known;
    default:
      return true;
  }
}

/**
 * Filters and sorts a list that comes newest first (as the server sends it).
 * Ties keep the newest first.
 */
export function sortFilterTango(
  list: Tango[],
  filter: TangoFilter,
  sort: TangoSort,
  scope: TangoScope = {},
): Tango[] {
  const inList = scope.listTangoIds ? new Set(scope.listTangoIds) : null;
  const kept = list
    .map((tango, newest) => ({ tango, newest }))
    .filter(
      ({ tango }) =>
        keep(tango, filter) &&
        matches(tango, scope.query) &&
        (!scope.placeId ||
          tango.sightings.some(s => s.placeId === scope.placeId)) &&
        (!inList || inList.has(tango.id)),
    );
  const byNewest = (a: { newest: number }, b: { newest: number }) =>
    a.newest - b.newest;
  kept.sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return b.newest - a.newest;
      case 'weakest':
        return a.tango.strength - b.tango.strength || byNewest(a, b);
      case 'strongest':
        return b.tango.strength - a.tango.strength || byNewest(a, b);
      case 'az':
        // By reading, in Japanese order (あいうえお).
        return (
          (a.tango.reading || a.tango.text).localeCompare(
            b.tango.reading || b.tango.text,
            'ja',
          ) || byNewest(a, b)
        );
      default:
        return byNewest(a, b);
    }
  });
  return kept.map(({ tango }) => tango);
}

/** Tango per page in the Tango tab's list. */
export const PAGE_SIZE = 20;

/**
 * The page buttons to show: the first and last page, and the pages next to
 * the current one, with 'gap' where pages are skipped, e.g. 1 … 4 5 6 … 10.
 */
export function pageNumbers(
  current: number,
  total: number,
): (number | 'gap')[] {
  const shown = new Set(
    [1, total, current - 1, current, current + 1].filter(
      p => p >= 1 && p <= total,
    ),
  );
  const sorted = [...shown].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((page, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && page - prev === 2) {
      // Only one page skipped: show it instead of a gap.
      out.push(prev + 1);
    } else if (prev !== undefined && page - prev > 2) {
      out.push('gap');
    }
    out.push(page);
  });
  return out;
}
