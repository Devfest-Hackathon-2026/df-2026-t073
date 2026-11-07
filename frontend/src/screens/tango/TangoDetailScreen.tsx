import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getTango } from '../../api/tango';
import { Jp } from '../../components/Jp';
import { MapPlaceholder, Screen, ScreenHeader } from '../../components/layout';
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

/** Spread sightings across the placeholder map. Real coordinates come with the map SDK. */
function pinsFor(tango: Tango): MapPin[] {
  return tango.sightings.map((s, i) => ({
    id: `${s.placeId}-${i}`,
    label: s.placeName,
    count: 1,
    x:
      tango.sightings.length === 1
        ? 0.5
        : 0.25 + (0.5 * i) / (tango.sightings.length - 1),
    y: 0.4,
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
                ? ` ${4 - t.strength} more step${4 - t.strength === 1 ? '' : 's'} until it's a star.`
                : " It's a star on your map."}
            </Text>
            {t.explanation ? <Text style={base.text}>{t.explanation}</Text> : null}

            <Card>
              <MapPlaceholder pins={pinsFor(t)} height={sizes.mapHeight / 2} />
              <Text style={base.caption}>
                <Text style={styles.strong}>
                  {t.sightings.length} place{t.sightings.length === 1 ? '' : 's'}.
                </Text>{' '}
                Reviews take turns showing each one, so it doesn't only stick at
                one spot.
              </Text>
              {t.sightings.map((s, i) => (
                <Text key={`${s.placeId}-${i}`} style={base.caption}>
                  ⌖ {s.placeName} · {new Date(s.seenAt).toDateString()}
                </Text>
              ))}
            </Card>

            {t.examples.length > 0 ? (
              <Card>
                <Text style={base.heading}>Phrases</Text>
                {orderExamples(t.examples, settings.phrasesFirst).map(example => (
                    <View key={example.jp.text} style={base.stackSm}>
                      <Text style={base.label}>
                        {example.register === 'easy' ? 'Easy' : 'Keigo'}
                      </Text>
                      <Jp {...example.jp} />
                      <Text style={base.caption}>{example.jp.meaning}</Text>
                    </View>
                ))}
              </Card>
            ) : null}

            <Card>
              <Text style={base.heading}>How it grew</Text>
              {t.history.map((event, i) => (
                <View key={`${event.type}-${i}`} style={styles.event}>
                  <View style={[styles.eventIcon, eventStyles[event.type]]}>
                    <Text style={styles.eventGlyph}>{EVENT_GLYPH[event.type]}</Text>
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

const eventStyles = StyleSheet.create({
  caught: { backgroundColor: colors.caution },
  reviewed: { backgroundColor: colors.accent },
  seen_again: { backgroundColor: colors.star },
});

const styles = StyleSheet.create({
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
