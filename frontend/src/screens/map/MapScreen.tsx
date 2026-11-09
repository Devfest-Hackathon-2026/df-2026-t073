import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getToday, searchPlaces } from '../../api/places';
import { TangoMap } from '../../components/TangoMap';
import { Icon } from '../../components/Icon';
import {
  Button,
  Card,
  Chip,
  Facts,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { type Coords, getCurrentCoords } from '../../location/location';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { type TabParamList, useRootNav } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, fontSizes, radii, sizes, space } from '../../styles/tokens';
import type { MapArea, MapPin } from '../../types';
import { PlaceSearchResults } from '../../components/PlaceSearchResults';
import { copy } from '../../copy';
import { favoriteHearts } from '../../features/places/FavoriteHeart';
import { useFavoritePlaces } from '../../features/places/useFavoritePlaces';

type MapFilter = 'all' | 'stars' | 'planned' | 'favorites';

/** The Map tab: your Tango as stamps, centred on where you are. */
export function MapScreen({
  route,
}: BottomTabScreenProps<TabParamList, 'Map'>): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const nav = useRootNav();
  const favorites = useFavoritePlaces();
  const today = useAsync(getToday);
  const [here, setHere] = useState<Coords | null>(null);
  const [filter, setFilter] = useState<MapFilter>('all');
  const [area, setArea] = useState<MapArea | null>(null);
  // Place search: results near you first; a pick opens Prepare.
  const [query, setQuery] = useState('');
  const results = useAsync(() => searchPlaces(query, here), query);

  useEffect(() => {
    let alive = true;
    getCurrentCoords().then(coords => alive && setHere(coords));
    return () => {
      alive = false;
    };
  }, []);

  // Opened from a neighbourhood card: show that area's card straight away.
  const startArea = route.params?.areaId;
  useEffect(() => {
    if (startArea && today.data) {
      setArea(today.data.areas.find(a => a.id === startArea) ?? null);
    }
  }, [startArea, today.data]);

  const pins = useMemo(() => {
    const fromServer = today.data?.pins ?? [];
    // "You are here" is the native location dot (showUser), not a pin.
    const all: MapPin[] = fromServer.filter(p => p.kind !== 'me');
    return all.filter(pin => {
      // Favourite places only show under their own filter.
      if (filter === 'favorites') {
        return pin.kind === 'favorite';
      }
      if (pin.kind === 'favorite') {
        return false;
      }
      if (filter === 'all') {
        return true;
      }
      if (filter === 'stars') {
        return (
          pin.kind === 'me' || (pin.kind === 'tango' && (pin.stars ?? 0) > 0)
        );
      }
      return pin.kind !== 'tango';
    });
  }, [today.data, filter]);

  return (
    <View style={styles.root}>
      <TangoMap
        pins={pins}
        focus={here}
        showUser
        showStars={filter === 'stars'}
        onPinPress={pin =>
          pin.kind === 'favorite' && pin.placeId
            ? nav.navigate('Prepare', { placeId: pin.placeId })
            : setArea(today.data?.areas.find(a => a.id === pin.areaId) ?? null)
        }
        onLocate={async () => {
          const coords = await getCurrentCoords();
          if (coords) {
            setHere(coords);
          } else {
            Alert.alert(
              copy.mapScreen.locationUnavailableTitle,
              copy.mapScreen.locationUnavailableBody,
            );
          }
          return coords;
        }}
      />

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.searchBox}>
          <Icon name="search" color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={copy.mapScreen.searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            accessibilityLabel={copy.mapScreen.searchA11y}
          />
        </View>
        {query.trim() ? (
          <PlaceSearchResults
            places={results.data ?? []}
            loading={results.loading}
            onPick={place => {
              setQuery('');
              nav.navigate('Prepare', { placeId: place.id });
            }}
            renderTrailing={favoriteHearts(favorites)}
          />
        ) : null}
        <View style={base.wrap}>
          <Chip
            label={copy.mapScreen.filterAll}
            selected={filter === 'all'}
            tone="outline"
            onPress={() => setFilter('all')}
          />
          <Chip
            icon="hanamaru"
            label={copy.mapScreen.filterStamps}
            selected={filter === 'stars'}
            tone="outline"
            onPress={() => setFilter('stars')}
          />
          <Chip
            label={copy.mapScreen.filterPlanned}
            selected={filter === 'planned'}
            tone="outline"
            onPress={() => setFilter('planned')}
          />
          <Chip
            icon="heart"
            label={copy.mapScreen.filterFavorites}
            selected={filter === 'favorites'}
            tone="outline"
            onPress={() => setFilter('favorites')}
          />
        </View>
        {area && !query.trim() ? (
          <AreaCard area={area} onClose={() => setArea(null)} />
        ) : null}
      </View>
    </View>
  );
}

/** A neighbourhood's Tango: review them or plan a visit. */
export function AreaCard({
  area,
  onClose,
}: {
  area: MapArea;
  onClose?: () => void;
}): React.JSX.Element {
  const nav = useRootNav();
  return (
    <Card>
      <View style={base.rowBetween}>
        <Text style={base.heading}>{area.label}</Text>
        <Pressable
          onPress={onClose}
          disabled={!onClose}
          accessibilityLabel={copy.mapScreen.closeAreaCard}
        >
          <View style={base.row}>
            <Facts
              items={[
                { icon: 'tango', text: copy.common.tangoCount(area.tangoCount) },
                { icon: 'pin', text: copy.common.placeCount(area.placeCount) },
              ]}
            />
            {onClose ? (
              <Icon name="close" size={fontSizes.md} color={colors.textMuted} />
            ) : null}
          </View>
        </Pressable>
      </View>
      <View style={base.wrap}>
        {area.sample.map(t => (
          <Chip
            key={t.id}
            jp={t}
            icon={t.known ? 'hanamaru' : undefined}
            tone={t.known ? 'hanamaru' : 'default'}
            onPress={() => nav.navigate('TangoDetail', { id: t.id })}
          />
        ))}
        {area.moreCount > 0 ? (
          <Text style={base.caption}>+{area.moreCount}</Text>
        ) : null}
      </View>
      <View style={base.row}>
        <Button
          label={copy.mapScreen.reviewThese}
          variant="secondary"
          style={base.grow}
          onPress={() =>
            nav.navigate('ReviewSession', { collectionId: `area:${area.id}` })
          }
        />
        {area.planPlaceId ? (
          <Button
            label={copy.mapScreen.planVisit}
            style={base.grow}
            onPress={() =>
              area.planPlaceId &&
              nav.navigate('Prepare', { placeId: area.planPlaceId })
            }
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: space.lg,
    minHeight: sizes.touch,
  },
  searchInput: {
    ...base.text,
    flex: 1,
    paddingVertical: 0,
  },
});
