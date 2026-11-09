import { useCallback, useEffect, useState } from 'react';
import {
  addFavoritePlace,
  listFavoritePlaces,
  removeFavoritePlace,
} from '../../api/places';

export interface FavoritePlaces {
  isFavorite: (placeId: string) => boolean;
  /** Flips a place's favorite state; shows it right away, undoes it on failure. */
  toggle: (placeId: string) => void;
}

/** The user's favorite places, for heart buttons. */
export function useFavoritePlaces(): FavoritePlaces {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    listFavoritePlaces()
      .then(places => alive && setIds(new Set(places.map(p => p.id))))
      .catch(() => {
        // No hearts filled in; the places still work.
      });
    return () => {
      alive = false;
    };
  }, []);

  const flip = (placeId: string) =>
    setIds(current => {
      const next = new Set(current);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });

  const toggle = useCallback(
    (placeId: string) => {
      const wasFavorite = ids.has(placeId);
      flip(placeId);
      (wasFavorite ? removeFavoritePlace : addFavoritePlace)(placeId).catch(
        () => flip(placeId),
      );
    },
    [ids],
  );

  return { isFavorite: placeId => ids.has(placeId), toggle };
}
