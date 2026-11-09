import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { copy } from '../copy';
import { base } from '../styles/base';
import { colors, radii, space } from '../styles/tokens';
import type { Place } from '../types';
import { Jp } from './Jp';

/** Place search results; the caller decides what picking one does. */
export function PlaceSearchResults({
  places,
  loading,
  onPick,
  renderTrailing,
}: {
  places: Place[];
  loading: boolean;
  onPick: (place: Place) => void;
  /** Shown at the end of each row, e.g. a favourite heart. */
  renderTrailing?: (place: Place) => React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.results}>
      {!loading && places.length === 0 ? (
        <Text style={base.caption}>{copy.mapScreen.noPlaces}</Text>
      ) : null}
      {places.map(place => (
        <View key={place.id} style={styles.row}>
          <Pressable
            accessibilityRole="button"
            style={[styles.result, base.grow]}
            onPress={() => onPick(place)}
          >
            <Jp {...place.name} bold />
            {[place.category, place.area].some(Boolean) ? (
              <Text style={base.caption}>
                {[place.category, place.area].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </Pressable>
          {renderTrailing?.(place)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  results: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.sm,
    gap: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  result: {
    padding: space.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
});
