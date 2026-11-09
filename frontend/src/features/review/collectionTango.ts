import type { Collection, Tango, TangoList } from '../../types';

const PLACE_PREFIX = 'place:';
const LIST_PREFIX = 'list:';

/** Where this Tango was most recently seen, or "" (as the server decides). */
function lastPlace(tango: Tango): string {
  let latest: { name: string; at: number } | null = null;
  for (const s of tango.sightings) {
    const name = s.placeName?.trim();
    if (!name) {
      continue;
    }
    const at = Date.parse(s.seenAt) || 0;
    if (!latest || at > latest.at) {
      latest = { name, at };
    }
  }
  return latest?.name ?? '';
}

/**
 * The Tango in a collection, matching how the server builds them. Null for
 * Place cue: it holds whatever is due now, which only the server knows.
 */
export function collectionTango(
  collection: Collection,
  tango: Tango[],
  lists: TangoList[],
): Tango[] | null {
  if (collection.isPlaceCue) {
    return null;
  }
  if (collection.isFavorites) {
    return tango.filter(t => t.favorite);
  }
  if (collection.isList) {
    const list = lists.find(
      l => l.id === collection.id.slice(LIST_PREFIX.length),
    );
    const ids = new Set(list?.tangoIds ?? []);
    return tango.filter(t => ids.has(t.id));
  }
  if (collection.id.startsWith(PLACE_PREFIX)) {
    const place = collection.id.slice(PLACE_PREFIX.length);
    return tango.filter(t => lastPlace(t) === place);
  }
  return [];
}
