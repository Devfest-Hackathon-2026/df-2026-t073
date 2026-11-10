import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  deleteTango,
  expandTango,
  getTango,
  removeSavedSentence,
  setFavorite,
} from '../../api/tango';
import { Icon, type IconName } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import { TangoMap } from '../../components/TangoMap';
import {
  Button,
  Card,
  Chip,
  Facts,
  IconButton,
  IconLabel,
  Loadable,
  StrengthBar,
  strengthLabel,
} from '../../components/ui';
import { STAGE_LABEL } from '../../features/review/labels';
import { playWord } from '../../features/tango/saveWord';
import { useCachedAsync } from '../../hooks/useCachedAsync';
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
import type { MapPin, RelatedVocab, Tango, TangoEvent } from '../../types';
import { orderExamples } from '../../utils/format';
import { AddToListSheet } from '../review/ListSheets';
import { copy } from '../../copy';

/** Shown while loading: build anticipation, not impatience. */
const DETAIL_LINES = copy.tangoDetail.loadingLines;

/** Checks for phrases written after the catch: every 4 s, at most 4 times. */
const PHRASES_RETRY_MS = 4000;
const PHRASES_MAX_TRIES = 4;

const EVENT_ICON: Record<TangoEvent['type'], IconName> = {
  caught: 'camera',
  reviewed: 'review',
  seen_again: 'seen',
  heard_in_rehearsal: 'play',
  said_in_rehearsal: 'mic',
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
        name: s.placeName || copy.tangoDetail.unknownPlace,
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
  const tango = useCachedAsync(`tango:detail:${id}`, () => getTango(id), id);
  // Cards from the dictionary get their phrases a few seconds after the catch.
  const tries = useRef(0);
  const noPhrases = tango.data?.examples.length === 0;
  const waitingForPhrases = noPhrases && tries.current < PHRASES_MAX_TRIES;
  const { reload, data } = tango;
  useEffect(() => {
    if (!waitingForPhrases) {
      return;
    }
    const timer = setTimeout(() => {
      tries.current += 1;
      reload();
    }, PHRASES_RETRY_MS);
    return () => clearTimeout(timer);
  }, [waitingForPhrases, reload, data]);

  // Favorite flips at once; the save follows (and rolls back on failure).
  const [favorite, setFavoriteState] = useState<boolean | null>(null);
  const isFavorite = favorite ?? data?.favorite ?? false;
  const toggleFavorite = async () => {
    const next = !isFavorite;
    setFavoriteState(next);
    try {
      await setFavorite(id, next);
    } catch {
      setFavoriteState(!next);
    }
  };
  const [addingToList, setAddingToList] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [customRelated, setCustomRelated] = useState<RelatedVocab[] | null>(
    null,
  );
  const relatedWords = customRelated ?? data?.relatedVocab ?? [];

  useEffect(() => {
    setFavoriteState(null);
    setCustomRelated(null);
    setExpandError(null);
    tries.current = 0;
  }, [id]);

  const handleDelete = () => {
    if (deleting) {
      return;
    }
    Alert.alert(copy.tangoDetail.deleteTitle, copy.tangoDetail.deleteBody, [
      { text: copy.common.cancel, style: 'cancel' },
      {
        text: copy.common.delete,
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteTango(id);
            navigation.goBack();
          } catch {
            setDeleting(false);
            Alert.alert(
              copy.tangoDetail.couldNotDeleteTitle,
              copy.tangoDetail.couldNotDeleteBody,
            );
          }
        },
      },
    ]);
  };

  const handleExpand = async () => {
    setExpanding(true);
    setExpandError(null);
    try {
      const words = await expandTango(id, settings.explanationsLanguage);
      setCustomRelated(words);
    } catch (err: unknown) {
      setExpandError(
        err instanceof Error && err.message
          ? err.message
          : copy.tangoDetail.couldNotExpand,
      );
    } finally {
      setExpanding(false);
    }
  };

  return (
    <Screen>
      <Loadable state={tango} messages={DETAIL_LINES}>
        {t => (
          <View style={base.stack}>
            <ScreenHeader onBack={() => navigation.goBack()} />

            <Card>
              <View style={styles.hero}>
                <Jp {...t} size="jumbo" bold center shrink />
                {t.romaji ? <Text style={base.caption}>{t.romaji}</Text> : null}
                <Text style={styles.meaning}>{t.meaning}</Text>
              </View>
              <View style={styles.actions}>
                <IconButton
                  icon="play"
                  label={copy.common.play(t.text)}
                  onPress={() => playWord(t.text)}
                />
                <IconButton
                  icon="heart"
                  label={
                    isFavorite
                      ? copy.tangoDetail.removeFavorite
                      : copy.tangoDetail.favorite
                  }
                  filled={isFavorite}
                  color={isFavorite ? colors.hanamaru : undefined}
                  onPress={toggleFavorite}
                />
                <IconButton
                  icon="addToList"
                  label={copy.tangoDetail.addToList}
                  onPress={() => setAddingToList(true)}
                />
                <IconButton
                  icon="delete"
                  label={copy.tangoDetail.deleteTango}
                  onPress={handleDelete}
                />
              </View>
            </Card>

            <View style={styles.strengthRow}>
              <View style={base.grow}>
                <StrengthBar strength={t.strength} />
              </View>
              <Text style={styles.strengthLabel}>
                {t.strength >= 4
                  ? strengthLabel(t.strength)
                  : copy.tangoDetail.toStamp(4 - t.strength)}
              </Text>
            </View>

            {t.explanation ? (
              <Text style={base.text}>{t.explanation}</Text>
            ) : null}

            <Card>
              <Text style={base.heading}>{copy.tangoDetail.phrases}</Text>
              {t.examples.length === 0 ? (
                <Text style={base.caption}>
                  {waitingForPhrases
                    ? copy.tangoDetail.writingPhrases
                    : copy.tangoDetail.noPhrases}
                </Text>
              ) : null}
              {orderExamples(t.examples, settings.phrasesFirst).map(example => (
                <View key={example.jp.text} style={styles.phrase}>
                  <View style={base.grow}>
                    <Text style={base.label}>
                      {example.register === 'easy'
                        ? copy.tangoDetail.registerEasy
                        : copy.tangoDetail.registerKeigo}
                    </Text>
                    <Jp {...example.jp} />
                    <Text style={base.caption}>{example.jp.meaning}</Text>
                  </View>
                  <IconButton
                    icon="play"
                    label={copy.common.play(example.jp.text)}
                    onPress={() => playWord(example.jp.text)}
                  />
                </View>
              ))}
            </Card>

            {t.savedSentences?.length ? (
              <Card>
                <Text style={base.heading}>
                  {copy.tangoDetail.yourSentences}
                </Text>
                {t.savedSentences.map(sentence => (
                  <View key={sentence.id} style={styles.phrase}>
                    <View style={base.grow}>
                      <Text style={base.label}>
                        {copy.tangoDetail.sentenceKind(sentence.kind)}
                      </Text>
                      <Jp {...sentence.jp} />
                      {sentence.jp.meaning ? (
                        <Text style={base.caption}>{sentence.jp.meaning}</Text>
                      ) : null}
                      <Facts
                        items={[{ icon: 'pin', text: sentence.placeName }]}
                      />
                    </View>
                    <IconButton
                      icon="play"
                      label={copy.common.play(sentence.jp.text)}
                      onPress={() => playWord(sentence.jp.text)}
                    />
                    <IconButton
                      icon="delete"
                      label={copy.tangoDetail.removeSentence(sentence.jp.text)}
                      onPress={() =>
                        removeSavedSentence(t.id, sentence.id)
                          .then(tango.reload)
                          .catch(() => {})
                      }
                    />
                  </View>
                ))}
              </Card>
            ) : null}

            {settings.mapFeatures ? <PlacesCard tango={t} /> : null}

            <Card>
              <View style={base.rowBetween}>
                <Text style={base.heading}>{copy.tangoDetail.history}</Text>
                <Text style={styles.badge}>
                  {copy.tangoDetail.stage(STAGE_LABEL[t.stage])}
                </Text>
              </View>
              {t.history.map((event, i) => (
                <View key={`${event.type}-${i}`} style={styles.event}>
                  <View style={[styles.eventIcon, eventStyles[event.type]]}>
                    <Icon
                      name={EVENT_ICON[event.type]}
                      size={fontSizes.md}
                      color={colors.textInverse}
                    />
                  </View>
                  <View style={base.grow}>
                    <Text style={styles.strong}>{event.label}</Text>
                    {event.detail ? (
                      <Text style={base.caption} numberOfLines={2}>
                        {event.detail}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.eventSide}>
                    {event.badge ? (
                      <Text style={styles.badge}>{event.badge}</Text>
                    ) : null}
                    {event.when ? (
                      <Text style={base.caption}>{event.when}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>

            <Card>
              <View style={base.rowBetween}>
                <Text style={base.heading}>
                  {copy.tangoDetail.relatedVocab}
                </Text>
                <IconLabel icon="ai" style={base.caption}>
                  {copy.tangoDetail.gemini}
                </IconLabel>
              </View>
              {relatedWords.length > 0 ? (
                relatedWords.map((rw, idx) => (
                  <View key={`${rw.kanji}-${idx}`} style={styles.phrase}>
                    <View style={base.grow}>
                      <Jp
                        text={rw.kanji}
                        reading={rw.reading}
                        meaning={rw.meaning}
                        peek
                        bold
                      />
                      <Text style={base.caption}>{rw.meaning}</Text>
                      {rw.relationNote ? (
                        <Text style={styles.relationNote}>
                          {rw.relationNote}
                        </Text>
                      ) : null}
                    </View>
                    <IconButton
                      icon="play"
                      label={copy.common.play(rw.kanji)}
                      onPress={() => playWord(rw.kanji)}
                    />
                  </View>
                ))
              ) : (
                <>
                  <Button
                    label={
                      expanding
                        ? copy.tangoDetail.generatingRelated
                        : copy.tangoDetail.expandRelated
                    }
                    variant="secondary"
                    disabled={expanding}
                    onPress={handleExpand}
                  />
                  {expandError ? (
                    <Text style={base.caption}>{expandError}</Text>
                  ) : null}
                </>
              )}
            </Card>

            <AddToListSheet
              visible={addingToList}
              tangoId={t.id}
              onClose={() => setAddingToList(false)}
            />
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
  return (
    <Card>
      <Text style={base.heading}>{copy.tangoDetail.whereYouSawIt}</Text>
      {pins.length > 0 ? (
        <View style={styles.miniMap}>
          <TangoMap pins={pins} compact interactive={false} />
        </View>
      ) : null}
      {groups.map(g => (
        <View key={g.key} style={styles.seenRow}>
          <View style={base.grow}>
            <IconLabel icon="pin" style={base.caption} numberOfLines={1}>
              {g.name}
            </IconLabel>
          </View>
          {g.count > 1 ? (
            <Chip label={copy.tangoDetail.timesSeen(g.count)} tone="outline" />
          ) : null}
          <Text style={base.caption}>{formatDay(g.lastSeen)}</Text>
        </View>
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
  seen_again: { backgroundColor: colors.hanamaru },
  heard_in_rehearsal: { backgroundColor: colors.ink },
  said_in_rehearsal: { backgroundColor: colors.positive },
});

const styles = StyleSheet.create({
  seenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  eventSide: {
    alignItems: 'flex-end',
    gap: space.xxs,
  },
  miniMap: {
    height: sizes.mapHeight * 0.8,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  hero: {
    alignItems: 'center',
    gap: space.xs,
  },
  meaning: {
    ...base.text,
    fontSize: fontSizes.lg,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.lg,
    marginTop: space.sm,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  strengthLabel: {
    ...base.caption,
    color: colors.hanamaru,
    fontWeight: fontWeights.bold,
  },
  phrase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
  badge: {
    ...base.caption,
    color: colors.hanamaru,
    fontWeight: fontWeights.bold,
  },
  relationNote: {
    ...base.caption,
    color: colors.accent,
  },
});
