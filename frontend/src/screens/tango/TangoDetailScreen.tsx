import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getTango } from '../../api/tango';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import { TangoMap } from '../../components/TangoMap';
import {
  Card,
  Chip,
  Loadable,
  StrengthBar,
  strengthLabel,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { RootScreenProps } from '../../navigation/types';
import { useSettings } from '../../state/SettingsContext';
import { base } from '../../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../../styles/tokens';
import type { MapPin, Tango, TangoEvent } from '../../types';
import { orderExamples } from '../../utils/format';

const EVENT_GLYPH: Record<TangoEvent['type'], string> = {
  caught: '◉',
  reviewed: '❐',
  seen_again: '👁',
};

interface PlaceGroup {
  key: string;
  name: string;
  count: number;
  lastSeen: string;
  lat: number | null;
  lng: number | null;
}

/** One row per place: sightings at the same place (id, or name if no id) are merged. */
function groupByPlace(tango: Tango): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const s of tango.sightings) {
    const key = s.placeId || s.placeName || 'unknown';
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (s.seenAt > group.lastSeen) {
        group.lastSeen = s.seenAt;
      }
      group.lat = group.lat ?? s.lat;
      group.lng = group.lng ?? s.lng;
    } else {
      groups.set(key, {
        key,
        name: s.placeName || 'Unknown place',
        count: 1,
        lastSeen: s.seenAt,
        lat: s.lat,
        lng: s.lng,
      });
    }
  }
  return [...groups.values()];
}

/** Map pins for places that have coordinates; the badge shows times seen there. */
function pinsFor(groups: PlaceGroup[]): MapPin[] {
  return groups
    .filter(g => g.lat !== null && g.lng !== null)
    .map(g => ({
      id: g.key,
      label: g.name,
      count: g.count,
      x: 0.5,
      y: 0.5,
      lat: g.lat as number,
      lng: g.lng as number,
      kind: 'tango' as const,
    }));
}

export function TangoDetailScreen({
  route,
  navigation,
}: RootScreenProps<'TangoDetail'>): React.JSX.Element {
  const { id } = route.params;
  const { settings } = useSettings();
  const tango = useAsync(() => getTango(id), id);

  return (
    <Screen>
      <Loadable state={tango}>
        {t => (
          <View style={base.stack}>
            <ScreenHeader
              onBack={() => navigation.goBack()}
              right={<Chip label={strengthLabel(t.strength)} tone="star" />}
            />
            <View style={styles.hero}>
              <Jp {...t} size="jumbo" bold />
              <Text style={base.caption}>
                {t.romaji} · {t.meaning}
              </Text>
              <Chip label={t.kind.replace('_', ' ')} tone="accent" />
            </View>
            <StrengthBar strength={t.strength} />
            <Text style={base.caption}>
              Grows when you review it and when you spot it out in the world.
              {t.strength < 4
                ? ` ${4 - t.strength} more step${
                    4 - t.strength === 1 ? '' : 's'
                  } until it's a star.`
                : " It's a star on your map."}
            </Text>
            {t.explanation ? (
              <Text style={base.text}>{t.explanation}</Text>
            ) : null}

            <PlacesCard tango={t} />

            {t.examples.length > 0 ? (
              <Card>
                <Text style={base.heading}>Phrases</Text>
                {orderExamples(t.examples, settings.phrasesFirst).map(
                  example => (
                    <View key={example.jp.text} style={base.stackSm}>
                      <Text style={base.label}>
                        {example.register === 'easy' ? 'Easy' : 'Keigo'}
                      </Text>
                      <Jp {...example.jp} />
                      <Text style={base.caption}>{example.jp.meaning}</Text>
                    </View>
                  ),
                )}
              </Card>
            ) : null}

            <Card>
              <Text style={base.heading}>How it grew</Text>
              {t.history.map((event, i) => (
                <View key={`${event.type}-${i}`} style={styles.event}>
                  <View style={[styles.eventIcon, eventStyles[event.type]]}>
                    <Text style={styles.eventGlyph}>
                      {EVENT_GLYPH[event.type]}
                    </Text>
                  </View>
                  <View style={base.grow}>
                    <Text style={styles.strong}>{event.label}</Text>
                    <Text style={base.caption}>{event.detail}</Text>
                  </View>
                  <Text style={styles.badge}>{event.badge}</Text>
                </View>
              ))}
            </Card>
          </View>
        )}
      </Loadable>
    </Screen>
  );
}

function PlacesCard({ tango }: { tango: Tango }): React.JSX.Element | null {
  const groups = groupByPlace(tango);
  if (groups.length === 0) {
    return null;
  }
  const pins = pinsFor(groups);
  const places = groups.length;
  const times = tango.sightings.length;
  return (
    <Card>
      {pins.length > 0 ? (
        <View style={styles.miniMap}>
          <TangoMap pins={pins} compact interactive={false} />
        </View>
      ) : (
        <Text style={base.caption}>
          No location was saved with these catches, so there's no map yet.
        </Text>
      )}
      <Text style={base.caption}>
        <Text style={styles.strong}>
          {places} place{places === 1 ? '' : 's'}
          {times > places ? `, seen ${times} times` : ''}.
        </Text>{' '}
        {places > 1
          ? "Reviews take turns showing each one, so it doesn't only stick at one spot."
          : 'Spot it somewhere new to add another place.'}
      </Text>
      {groups.map(g => (
        <Text key={g.key} style={base.caption}>
          ⌖ {g.name}
          {g.count > 1 ? ` · ${g.count}×` : ''} · last {formatDay(g.lastSeen)}
        </Text>
      ))}
    </Card>
  );
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const eventStyles = StyleSheet.create({
  caught: { backgroundColor: colors.caution },
  reviewed: { backgroundColor: colors.accent },
  seen_again: { backgroundColor: colors.star },
});

const styles = StyleSheet.create({
  miniMap: {
    height: sizes.mapHeight * 0.8,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  hero: {
    alignItems: 'center',
    gap: space.xs,
  },
  strong: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  eventIcon: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventGlyph: {
    fontSize: fontSizes.md,
    color: colors.textInverse,
  },
  badge: {
    ...base.caption,
    color: colors.star,
    fontWeight: fontWeights.bold,
  },
});
