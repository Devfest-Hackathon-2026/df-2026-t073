import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLive } from '../../config';
import { getToday } from '../../api/places';
import { type Coords, getCurrentCoords } from '../../location/location';
import { getReviewCard, getReviewSummary } from '../../api/review';
import { Jp } from '../../components/Jp';
import { TangoMap } from '../../components/TangoMap';
import {
  Button,
  Card,
  Chip,
  IconButton,
  Loadable,
  NumberedStep,
  SectionTitle,
} from '../../components/ui';
import {
  playWord,
  SAVE_ICON,
  SAVE_LABEL,
  useSaveWord,
} from '../../features/tango/saveWord';
import { useAsync } from '../../hooks/useAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import { useRootNav } from '../../navigation/types';
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
import type {
  MapArea,
  MapPin,
  ReviewCard,
  ReviewSummary,
  TodaySummary,
  Visit,
  WordOfDay,
} from '../../types';
import { formatVisitTime } from '../../utils/format';
import { Icon } from '../../components/Icon';

/** Shown while loading: build anticipation, not impatience. */
const TODAY_LINES = [
  "Gathering today's words…",
  "Checking what's due…",
  'Choosing your word of the day…',
];

const GREETING = {
  text: 'こんにちは',
  reading: 'こんにちは',
  romaji: 'konnichiwa',
  meaning: 'Hello',
};

/** Share of the screen the map gets while the sheet is open (slide 5). */
const MAP_CARD_HEIGHT = 168;
/** Day one's practice place: the backend's built-in ramen shop, or the mock one. */
const DAY_ONE_PLACE = isLive('rehearse')
  ? 'builtin:menya-taiki'
  : 'menya-taiki';

export function TodayScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const nav = useRootNav();
  const today = useAsync(getToday);
  const review = useAsync(getReviewCard);
  const stats = useAsync(getReviewSummary);
  useReloadOnFocus(today.reload, review.reload, stats.reload);
  // Device position: the map preview centres on it.
  const [here, setHere] = useState<Coords | null>(null);
  useEffect(() => {
    let alive = true;
    getCurrentCoords().then(coords => alive && setHere(coords));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Loadable state={today} messages={TODAY_LINES}>
        {summary =>
          settings.dayOne ? (
            <DayOne summary={summary} />
          ) : (
            <Regular
              summary={summary}
              review={review.data}
              stats={stats.data}
              here={here}
              onOpenMap={areaId =>
                nav.navigate('Tabs', {
                  screen: 'Map',
                  params: areaId ? { areaId } : undefined,
                })
              }
            />
          )
        }
      </Loadable>
    </ScrollView>
  );
}

/** Tango, reviews due and neighbourhoods at a glance. */
function StatsRow({
  stats,
  areas,
}: {
  stats: ReviewSummary;
  areas: number;
}): React.JSX.Element {
  const items = [
    { value: stats.totalTango, label: 'Tango' },
    { value: stats.dueCount, label: 'to review' },
    { value: areas, label: areas === 1 ? 'area' : 'areas' },
  ];
  return (
    <View style={styles.stats}>
      {items.map(item => (
        <View key={item.label} style={styles.stat}>
          <Text style={styles.statValue}>{item.value}</Text>
          <Text style={base.caption}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Where your Tango come from, as collectible cards. */
function Neighbourhoods({
  areas,
  onOpen,
}: {
  areas: MapArea[];
  onOpen: (areaId: string) => void;
}): React.JSX.Element {
  return (
    <View style={base.stackSm}>
      <SectionTitle
        en="Your neighbourhoods"
        jp={{ text: '近所', reading: 'きんじょ', romaji: 'kinjo' }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.areaRow}
      >
        {areas.map(area => (
          <Pressable
            key={area.id}
            accessibilityRole="button"
            onPress={() => onOpen(area.id)}
            style={styles.areaTile}
          >
            <View style={styles.areaStamp}>
              <Text style={styles.areaStampText}>{area.tangoCount}</Text>
            </View>
            <Text style={base.heading} numberOfLines={2}>
              {area.label}
            </Text>
            <Text style={base.caption} numberOfLines={1}>
              {area.sample
                .slice(0, 3)
                .map(t => t.text)
                .join('・')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** A small, still preview of the map; opens the full map. */
function MapCard({
  pins,
  here,
  onOpen,
}: {
  pins: MapPin[];
  here: Coords | null;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your Tango map"
      onPress={onOpen}
      style={styles.mapCard}
    >
      <View style={styles.mapPreview} pointerEvents="none">
        <TangoMap pins={pins} focus={here} interactive={false} compact />
      </View>
      <View style={styles.mapCaption}>
        <Text style={base.heading}>Your Tango map</Text>
        <View style={base.row}>
          <Text style={styles.mapOpen}>Explore</Text>
          <Icon name="forward" color={colors.accent} />
        </View>
      </View>
    </Pressable>
  );
}

function Greeting({ name }: { name: string }): React.JSX.Element {
  return (
    <View style={base.row}>
      <Jp {...GREETING} peek bold size="xl" />
      <NameSan name={name} />
    </View>
  );
}

function NameSan({ name }: { name: string }): React.JSX.Element {
  return (
    <Jp
      text={`${name}さん`}
      romaji={`${name}-san`}
      meaning={`${name} (with the polite さん)`}
      bold
      size="xl"
    />
  );
}

function Regular({
  summary,
  review,
  stats,
  here,
  onOpenMap,
}: {
  summary: TodaySummary;
  review: ReviewCard | undefined;
  stats: ReviewSummary | undefined;
  here: Coords | null;
  onOpenMap: (areaId?: string) => void;
}): React.JSX.Element {
  const { settings } = useSettings();
  return (
    <>
      <Greeting name={summary.userName} />
      {stats ? <StatsRow stats={stats} areas={summary.areas.length} /> : null}
      {summary.wordOfDay ? <WordOfDayCard word={summary.wordOfDay} /> : null}
      {review ? <ReviewCardView card={review} /> : null}
      {summary.upNext ? <UpNextCard visit={summary.upNext} /> : <PlansRow />}
      {settings.mapFeatures && summary.areas.length > 0 ? (
        <Neighbourhoods areas={summary.areas} onOpen={onOpenMap} />
      ) : null}
      {settings.mapFeatures ? (
        <MapCard pins={summary.pins} here={here} onOpen={() => onOpenMap()} />
      ) : null}
    </>
  );
}

function UpNextCard({ visit }: { visit: Visit }): React.JSX.Element {
  const nav = useRootNav();
  return (
    <Card variant="accent">
      <Text style={styles.eyebrowInverse}>
        Up next · {formatVisitTime(visit.when)}
      </Text>
      <View style={base.rowBetween}>
        <View style={base.grow}>
          <Jp {...visit.place.name} bold size="lg" tone="inverse" />
          <Text style={styles.captionInverse}>
            {visit.place.category} · {visit.place.area} · {visit.tangoCount}{' '}
            Tango
          </Text>
        </View>
        <Button
          label="Prepare"
          variant="light"
          onPress={() => nav.navigate('Prepare', { placeId: visit.place.id })}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => nav.navigate('Plans')}
        style={styles.plansLink}
      >
        <Text style={styles.plansLinkInverse}>All plans</Text>
        <Icon name="forward" size={fontSizes.md} color={colors.textInverse} />
      </Pressable>
    </Card>
  );
}

/** Nothing planned yet: a quiet way into Plans. */
function PlansRow(): React.JSX.Element {
  const nav = useRootNav();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => nav.navigate('Plans')}
      style={styles.plansRow}
    >
      <View style={base.grow}>
        <Text style={base.heading}>Your plans</Text>
        <Text style={base.caption}>Nothing planned yet</Text>
      </View>
      <Icon name="forward" color={colors.accent} />
    </Pressable>
  );
}

function WordOfDayCard({ word }: { word: WordOfDay }): React.JSX.Element {
  const saver = useSaveWord(word);
  return (
    <Card>
      <Text style={styles.eyebrow}>Word of the day</Text>
      <Text style={base.caption}>{word.reason}</Text>
      <View style={base.rowBetween}>
        <View style={base.grow}>
          <Jp
            text={word.text}
            reading={word.reading}
            romaji={word.romaji}
            bold
            size="jumbo"
          />
          <Text style={styles.wordMeaning}>{word.meaning}</Text>
        </View>
        <IconButton
          icon="play"
          label={`Play ${word.text}`}
          onPress={() => playWord(word.text)}
        />
      </View>
      <Button
        label={SAVE_LABEL[saver.state]}
        icon={SAVE_ICON[saver.state]}
        variant="secondary"
        disabled={saver.busy}
        onPress={saver.save}
      />
    </Card>
  );
}

function ReviewCardView({ card }: { card: ReviewCard }): React.JSX.Element {
  const nav = useRootNav();
  return (
    <Card>
      <View style={base.rowBetween}>
        <View style={base.grow}>
          <SectionTitle
            en="Review"
            jp={{ text: '復習', reading: 'ふくしゅう', romaji: 'fukushū' }}
          />
          <Text style={base.caption}>
            {card.dueCount} due · about {card.minutes} min
          </Text>
          <Text style={base.caption}>From {card.areas.join(', ')}</Text>
        </View>
        <Button
          label="Start"
          variant="dark"
          onPress={() => nav.navigate('ReviewSession')}
        />
      </View>
      <View style={base.wrap}>
        {card.sample.map(tango => (
          <Chip
            key={tango.id}
            jp={tango}
            icon={tango.sightings.length ? 'pin' : undefined}
            onPress={() => nav.navigate('TangoDetail', { id: tango.id })}
          />
        ))}
        {card.moreCount > 0 ? (
          <Text style={base.caption}>+{card.moreCount}</Text>
        ) : null}
      </View>
    </Card>
  );
}

function DayOne({ summary }: { summary: TodaySummary }): React.JSX.Element {
  const nav = useRootNav();
  const { update } = useSettings();
  return (
    <>
      <View style={base.row}>
        <Jp
          text="ようこそ"
          reading="ようこそ"
          romaji="yōkoso"
          meaning="Welcome"
          peek
          bold
          size="xl"
        />
        <NameSan name={summary.userName} />
      </View>
      <Card>
        <View style={base.rowBetween}>
          <Text style={base.heading}>Your first outing</Text>
          <Text style={base.caption}>About 10 min</Text>
        </View>
        <NumberedStep index={1}>
          <View style={base.rowBetween}>
            <View style={base.grow}>
              <Text style={styles.stepTitle}>
                Catch 3 Tango around the station
              </Text>
            </View>
            <Button label="Start" onPress={() => nav.navigate('Capture')} />
          </View>
        </NumberedStep>
        <NumberedStep index={2}>
          <View style={base.rowBetween}>
            <View style={base.grow}>
              <Text style={styles.stepTitle}>Rehearse buying a ticket</Text>
              <Text style={base.caption}>
                1 min with Gemini, at your own pace
              </Text>
            </View>
            <Button
              label="Go"
              variant="secondary"
              onPress={() =>
                nav.navigate('Rehearse', { placeId: DAY_ONE_PLACE })
              }
            />
          </View>
        </NumberedStep>
        <NumberedStep index={3}>
          <View style={base.rowBetween}>
            <View style={base.grow}>
              <Text style={styles.stepTitle}>Your first review tonight</Text>
              <Text style={base.caption}>Opens after you catch 3</Text>
            </View>
            <Button
              label="Go"
              variant="secondary"
              onPress={() => nav.navigate('ReviewSession')}
            />
          </View>
        </NumberedStep>
      </Card>
      <Text style={styles.eyebrow}>
        Tango you'll likely see around Koenji Station
      </Text>
      <View style={base.wrap}>
        {summary.starterTango.map(jp => (
          <Chip key={jp.text} jp={jp} label={jp.meaning} dashed />
        ))}
      </View>
      <Button
        label="Finish day one (show the regular Today screen)"
        variant="ghost"
        onPress={() => update({ dayOne: false })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  stats: {
    flexDirection: 'row',
    gap: space.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
    gap: space.xxs,
  },
  statValue: {
    ...base.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  wordMeaning: {
    ...base.text,
    fontSize: fontSizes.lg,
  },
  areaRow: {
    gap: space.sm,
  },
  areaTile: {
    width: space.xxl * 5,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
    gap: space.xs,
  },
  // Matches the stamp pins on the map.
  areaStamp: {
    alignSelf: 'flex-start',
    minWidth: sizes.touch * 0.75,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radii.sm,
    borderWidth: sizes.border * 2,
    borderColor: colors.accent,
    alignItems: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  areaStampText: {
    ...base.text,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  mapCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  mapPreview: {
    height: MAP_CARD_HEIGHT,
  },
  mapCaption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.md,
  },
  plansLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  plansLinkInverse: {
    ...base.caption,
    color: colors.textInverse,
    fontWeight: fontWeights.bold,
  },
  plansRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
  },
  mapOpen: {
    ...base.text,
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
  eyebrow: {
    ...base.label,
    color: colors.accent,
  },
  eyebrowInverse: {
    ...base.label,
    color: colors.textInverse,
  },
  captionInverse: {
    ...base.caption,
    color: colors.textInverse,
  },
  stepTitle: {
    ...base.text,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.md,
  },
});
