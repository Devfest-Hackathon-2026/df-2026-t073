import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLive } from '../../config';
import { getToday, listVisits } from '../../api/places';
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
import { PlanVisitSheet } from '../../features/plans/PlanVisitSheet';
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
import { copy } from '../../copy';

/** Shown while loading: build anticipation, not impatience. */
const TODAY_LINES = copy.today.loadingLines;

const GREETING = copy.today.greeting;

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
              onPlansChanged={today.reload}
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
    { value: stats.totalTango, label: copy.today.statTango },
    { value: stats.dueCount, label: copy.today.statToReview },
    { value: areas, label: copy.today.statAreas(areas) },
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
        en={copy.today.neighbourhoods}
        jp={copy.today.neighbourhoodsJp}
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
                .join(copy.today.sampleSeparator)}
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
      accessibilityLabel={copy.today.openMap}
      onPress={onOpen}
      style={styles.mapCard}
    >
      <View style={styles.mapPreview} pointerEvents="none">
        <TangoMap pins={pins} focus={here} interactive={false} compact />
      </View>
      <View style={styles.mapCaption}>
        <Text style={base.heading}>{copy.today.tangoMap}</Text>
        <View style={base.row}>
          <Text style={styles.mapOpen}>{copy.today.explore}</Text>
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
    <Jp {...copy.today.nameSan(name)} bold size="xl" />
  );
}

function Regular({
  summary,
  review,
  stats,
  here,
  onOpenMap,
  onPlansChanged,
}: {
  summary: TodaySummary;
  review: ReviewCard | undefined;
  stats: ReviewSummary | undefined;
  here: Coords | null;
  onOpenMap: (areaId?: string) => void;
  /** After a plan is added from Today, so "Up next" shows it. */
  onPlansChanged: () => void;
}): React.JSX.Element {
  const { settings } = useSettings();
  const visits = useAsync(listVisits);
  const [planning, setPlanning] = useState(false);
  return (
    <>
      <Greeting name={summary.userName} />
      {stats ? <StatsRow stats={stats} areas={summary.areas.length} /> : null}
      {summary.wordOfDay ? <WordOfDayCard word={summary.wordOfDay} /> : null}
      {review ? <ReviewCardView card={review} /> : null}
      {summary.upNext ? <UpNextCard visit={summary.upNext} /> : null}
      <PlansRow
        hasPlans={summary.upNext !== null}
        onPlan={() => setPlanning(true)}
      />
      <PlanVisitSheet
        visible={planning}
        onClose={() => setPlanning(false)}
        visits={visits.data ?? []}
        onSaved={() => {
          visits.reload();
          onPlansChanged();
        }}
      />
      {settings.mapFeatures && summary.areas.length > 0 ? (
        <Neighbourhoods areas={summary.areas} onOpen={onOpenMap} />
      ) : null}
      {settings.mapFeatures ? (
        <MapCard pins={summary.pins} here={here} onOpen={() => onOpenMap()} />
      ) : null}
    </>
  );
}

/** The next planned visit, ready to prepare. */
function UpNextCard({ visit }: { visit: Visit }): React.JSX.Element {
  const nav = useRootNav();
  return (
    <Card variant="accent">
      <Text style={styles.eyebrowInverse}>
        {copy.today.upNext(formatVisitTime(visit.when))}
      </Text>
      <View style={base.rowBetween}>
        <View style={base.grow}>
          <Jp {...visit.place.name} bold size="lg" tone="inverse" />
          <Text style={styles.captionInverse}>
            {copy.today.visitLine(
              visit.place.category,
              visit.place.area,
              visit.tangoCount,
            )}
          </Text>
        </View>
        <Button
          label={copy.today.prepare}
          variant="light"
          onPress={() => nav.navigate('Prepare', { placeId: visit.place.id })}
        />
      </View>
    </Card>
  );
}

/** Plan a new visit, or open all plans. */
function PlansRow({
  hasPlans,
  onPlan,
}: {
  hasPlans: boolean;
  onPlan: () => void;
}): React.JSX.Element {
  const nav = useRootNav();
  return (
    <View style={styles.plansRow}>
      <Pressable
        accessibilityRole="button"
        onPress={() => nav.navigate('Plans')}
        style={base.grow}
      >
        <Text style={base.heading}>{copy.today.yourPlans}</Text>
        <View style={base.row}>
          <Text style={styles.plansLinkText}>
            {hasPlans ? copy.today.allPlans : copy.today.nothingPlanned}
          </Text>
          {hasPlans ? (
            <Icon name="forward" size={fontSizes.md} color={colors.accent} />
          ) : null}
        </View>
      </Pressable>
      <Button label={copy.today.planVisit} icon="add" onPress={onPlan} />
    </View>
  );
}

function WordOfDayCard({ word }: { word: WordOfDay }): React.JSX.Element {
  const saver = useSaveWord(word);
  return (
    <Card>
      <Text style={styles.eyebrow}>{copy.today.wordOfDay}</Text>
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
          label={copy.common.play(word.text)}
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
            en={copy.today.reviewTitle}
            jp={copy.today.reviewTitleJp}
          />
          <Text style={base.caption}>
            {copy.today.reviewSummary(card.dueCount, card.minutes)}
          </Text>
          <Text style={base.caption}>
            {copy.today.reviewFrom(card.areas)}
          </Text>
        </View>
        <Button
          label={copy.today.start}
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
          <Text style={base.caption}>{copy.today.more(card.moreCount)}</Text>
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
        <Jp {...copy.today.welcomeJp} peek bold size="xl" />
        <NameSan name={summary.userName} />
      </View>
      <Card>
        <View style={base.rowBetween}>
          <Text style={base.heading}>{copy.today.firstOuting}</Text>
          <Text style={base.caption}>{copy.today.aboutTenMin}</Text>
        </View>
        <NumberedStep index={1}>
          <View style={base.rowBetween}>
            <View style={base.grow}>
              <Text style={styles.stepTitle}>{copy.today.stepCatch}</Text>
            </View>
            <Button
              label={copy.today.start}
              onPress={() => nav.navigate('Capture')}
            />
          </View>
        </NumberedStep>
        <NumberedStep index={2}>
          <View style={base.rowBetween}>
            <View style={base.grow}>
              <Text style={styles.stepTitle}>
                {copy.today.stepRehearse}
              </Text>
              <Text style={base.caption}>{copy.today.stepRehearseNote}</Text>
            </View>
            <Button
              label={copy.today.go}
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
              <Text style={styles.stepTitle}>{copy.today.stepReview}</Text>
              <Text style={base.caption}>{copy.today.stepReviewNote}</Text>
            </View>
            <Button
              label={copy.today.go}
              variant="secondary"
              onPress={() => nav.navigate('ReviewSession')}
            />
          </View>
        </NumberedStep>
      </Card>
      <Text style={styles.eyebrow}>{copy.today.starterTango}</Text>
      <View style={base.wrap}>
        {summary.starterTango.map(jp => (
          <Chip key={jp.text} jp={jp} label={jp.meaning} dashed />
        ))}
      </View>
      <Button
        label={copy.today.finishDayOne}
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
  plansLinkText: {
    ...base.caption,
    color: colors.accent,
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
