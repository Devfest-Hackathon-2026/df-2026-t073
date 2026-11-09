import React from 'react';
import { IconButton } from '../../components/ui';
import { copy } from '../../copy';
import { colors } from '../../styles/tokens';
import type { Place } from '../../types';
import type { FavoritePlaces } from './useFavoritePlaces';

/** Heart button that favorites a place. */
export function FavoriteHeart({
  placeId,
  name,
  favorites,
}: {
  placeId: string;
  name: string;
  favorites: FavoritePlaces;
}): React.JSX.Element {
  const on = favorites.isFavorite(placeId);
  return (
    <IconButton
      icon="heart"
      label={
        on
          ? copy.mapScreen.unfavoritePlace(name)
          : copy.mapScreen.favoritePlace(name)
      }
      filled={on}
      color={on ? colors.hanamaru : undefined}
      onPress={() => favorites.toggle(placeId)}
    />
  );
}

/** For PlaceSearchResults' renderTrailing: a heart on each result. */
export function favoriteHearts(
  favorites: FavoritePlaces,
): (place: Place) => React.ReactNode {
  return place => (
    <FavoriteHeart
      placeId={place.id}
      name={place.name.text}
      favorites={favorites}
    />
  );
}
