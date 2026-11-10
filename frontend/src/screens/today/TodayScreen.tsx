import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLive } from '../../config';
import { getToday, listVisits } from '../../api/places';
import { type Coords, getCurrentCoords } from '../../location/location';
import { getReviewCard } from '../../api/review';
import { Jp } from '../../components/Jp';
import { TangoMap } from '../../components/TangoMap';
import {
  Button,
  Card,
  Chip,
  Facts,
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
import {
  FIRST_CATCH,
  FIRST_STEPS,
  firstStepsProgress,
} from '../../features/today/firstSteps';
import { ReviewStartCard } from '../../features/review/ReviewStartCard';
import { TicketCard } from '../../components/shapes';
import { useCachedAsync } from '../../hooks/useCachedAsync';
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
  TodaySummary,
  Visit,
  WordOfDay,
} from '../../types';
import { formatVisitTime } from '../../utils/format';
import { NotoHanamaru } from '../../components/NotoHanamaru';
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
  const today = useCachedAsync('today:summary', getToday);
  const review = useCachedAsync('review:card', getReviewCard);
  useReloadOnFocus(today.revalidate, review.revalidate);
  // Device position: the map preview centers on it.
  const [here, setHere] = useState<Coords | null>(null);
  useEffect(() => {
    let alive = true;
    getCurrentCoords().then(coords => alive && setHere(coords));
    return () => {
      alive = false;
    };
  }, []);

  const [pullRefreshing, setPullRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([today.reload(), review.reload()]);
    } finally {
      setPullRefreshing(false);
    }
  }, [today, review]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={pullRefreshing}
          onRefresh={onRefresh}
          colors={[colors.accent]}
          tintColor={colors.accent}
        />
      }
    >
      <SectionTitle en={copy.today.title} size="title" />
      <Loadable state={today} messages={TODAY_LINES}>
        {summary => (
          <Regular
            summary={summary}
            review={review.data}
            here={here}
            showFirstOuting={settings.dayOne}
            onOpenMap={areaId =>
              nav.navigate('Tabs', {
                screen: 'Map',
                params: areaId ? { areaId } : undefined,
              })
            }
            onPlansChanged={today.reload}
          />
        )}
      </Loadable>
    </ScrollView>
  );
}

/** Where your Tango come from, as collectible cards. */
function Neighborhoods({
  areas,
  onOpen,
}: {
  areas: MapArea[];
  onOpen: (areaId: string) => void;
}): React.JSX.Element {
  return (
    <View style={base.stackSm}>
      <SectionTitle
        en={copy.today.neighborhoods}
        jp={copy.today.neighborhoodsJp}
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
      {/* The comma sits outside the tappable, underlined greeting. */}
      <View style={styles.greeting}>
        <Jp {...GREETING} peek bold size="xl" />
        <Jp {...copy.today.greetingComma} bold size="xl" />
      </View>
      <NameSan name={name} />
    </View>
  );
}

function NameSan({ name }: { name: string }): React.JSX.Element {
  return <Jp {...copy.today.nameSan(name)} bold size="xl" />;
}

function Regular({
  summary,
  review,
  here,
  showFirstOuting,
  onOpenMap,
  onPlansChanged,
}: {
  summary: TodaySummary;
  review: ReviewCard | undefined;
  here: Coords | null;
  showFirstOuting: boolean;
  onOpenMap: (areaId?: string) => void;
  /** After a plan is added from Today, so "Up next" shows it. */
  onPlansChanged: () => void;
}): React.JSX.Element {
  const { settings, update } = useSettings();
  const visits = useCachedAsync('visits:list', listVisits);
  const [planning, setPlanning] = useState(false);

  const effectiveReview = summary.reviewCard ?? review;

  return (
    <>
      <Greeting name={summary.userName} />
      {showFirstOuting ? (
        <FirstOutingCard
          summary={summary}
          onDismiss={() => update({ dayOne: false })}
          onPlan={() => setPlanning(true)}
        />
      ) : null}
      {summary.wordOfDay ? <WordOfDayCard word={summary.wordOfDay} /> : null}
      {effectiveReview ? (
        <ReviewStartCard
          card={effectiveReview}
          title={copy.today.reviewTitle}
        />
      ) : null}
      {summary.upNext ? <UpNextCard visit={summary.upNext} /> : null}
      <PlansRow
        hasPlans={summary.upNext !== null}
        onPlan={() => setPlanning(true)}
      />
      <PlanVisitSheet
        visible={planning}
        onClose={() => setPlanning(false)}
        visits={visits.data ?? []}
        onSaved={async () => {
          await visits.reload();
          await onPlansChanged();
        }}
      />
      {settings.mapFeatures && summary.areas.length > 0 ? (
        <Neighborhoods areas={summary.areas} onOpen={onOpenMap} />
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
    <TicketCard
      stub={
        <Button
          label={copy.today.prepare}
          onPress={() => nav.navigate('Prepare', { placeId: visit.place.id })}
        />
      }
    >
      <Text style={base.heading}>{copy.today.upNext}</Text>
      <Jp {...visit.place.name} bold size="lg" furigana={false} />
      <Facts
        items={[
          { icon: 'calendar', text: formatVisitTime(visit.when) },
          { icon: 'category', text: visit.place.category },
          { icon: 'pin', text: visit.place.area },
        ]}
      />
    </TicketCard>
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
  const { settings } = useSettings();
  // With the map off, Plans is a tab: switch to it rather than stacking a copy.
  const openPlans = () =>
    settings.mapFeatures
      ? nav.navigate('Plans')
      : nav.navigate('Tabs', { screen: 'PlansTab' });
  return (
    <View style={styles.plansRow}>
      <View style={base.grow}>
        <Text style={base.heading}>{copy.today.yourPlans}</Text>
        {hasPlans ? null : (
          <Text style={base.caption}>{copy.today.nothingPlanned}</Text>
        )}
      </View>
      <Button label={copy.today.planVisit} icon="add" onPress={onPlan} />
      {hasPlans ? (
        <Button
          label={copy.today.allPlans}
          variant="secondary"
          onPress={openPlans}
        />
      ) : null}
    </View>
  );
}

/** Jisho, a free online Japanese dictionary. */
const DICTIONARY_URL = 'https://jisho.org/search/';

function WordOfDayCard({ word }: { word: WordOfDay }): React.JSX.Element {
  const saver = useSaveWord(word);
  return (
    <Card>
      <Text style={styles.eyebrow}>{copy.today.wordOfDay}</Text>
      {word.reason ? <Text style={base.caption}>{word.reason}</Text> : null}
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
        <View style={base.row}>
          <IconButton
            icon="play"
            label={copy.common.play(word.text)}
            onPress={() => playWord(word.text)}
          />
          <IconButton
            icon="search"
            label={copy.today.lookUp(word.text)}
            onPress={() =>
              Linking.openURL(
                DICTIONARY_URL + encodeURIComponent(word.text),
              ).catch(() => {})
            }
          />
        </View>
      </View>
      <Button
        label={
          saver.state === 'saved' ? copy.today.saved : SAVE_LABEL[saver.state]
        }
        icon={SAVE_ICON[saver.state]}
        variant="secondary"
        disabled={saver.busy}
        onPress={saver.save}
      />
      {saver.canUndo ? (
        <Text
          accessibilityRole="button"
          style={styles.undoLink}
          onPress={saver.undo}
        >
          {copy.today.undoSave}
        </Text>
      ) : null}
    </Card>
  );
}

function FirstOutingCard({
  summary,
  onDismiss,
  onPlan,
}: {
  summary: TodaySummary;
  onDismiss: () => void;
  onPlan: () => void;
}): React.JSX.Element {
  const nav = useRootNav();
  const { settings } = useSettings();
  const progress = firstStepsProgress({
    totalTango: summary.totalTango ?? 0,
    hasPlan: !!summary.upNext,
    // Saved on the account; the local flag shows it right away.
    rehearsed: !!summary.rehearsedOnce || settings.rehearsedOnce,
  });
  let status: string = copy.today.aboutTenMin;
  if (progress.allDone) {
    status = copy.today.allStepsDone;
  } else if (progress.doneCount > 0) {
    status = copy.today.stepsDone(progress.doneCount, FIRST_STEPS);
  }
  return (
    <Card>
      <View style={styles.firstOutingHeader}>
        <View style={base.grow}>
          <Text style={base.heading}>{copy.today.firstOuting}</Text>
          <Text style={[base.caption, progress.allDone && styles.allDone]}>
            {status}
          </Text>
        </View>
        <IconButton
          icon="close"
          label={copy.today.dismissFirstOuting}
          onPress={onDismiss}
        />
      </View>
      <FirstStep
        index={1}
        title={copy.today.stepCatch}
        note={copy.today.caughtCount(progress.caught, FIRST_CATCH)}
        done={progress.catchDone}
        action={
          <Button
            label={copy.today.start}
            onPress={() => nav.navigate('Capture')}
          />
        }
      />
      <FirstStep
        index={2}
        title={copy.today.stepPlan}
        done={progress.planDone}
        action={
          <Button label={copy.today.go} variant="secondary" onPress={onPlan} />
        }
      />
      <FirstStep
        index={3}
        title={copy.today.stepRehearse}
        done={progress.rehearseDone}
        action={
          <Button
            label={copy.today.go}
            variant="secondary"
            // At the planned place once there is one; else the practice place.
            onPress={() =>
              nav.navigate('Rehearse', {
                placeId: summary.upNext?.place.id ?? DAY_ONE_PLACE,
              })
            }
          />
        }
      />
      <Text style={styles.eyebrow}>{copy.today.starterTango}</Text>
      <View style={base.wrap}>
        {summary.starterTango.map(jp => (
          <Chip key={jp.text} jp={jp} label={jp.meaning} dashed />
        ))}
      </View>
    </Card>
  );
}

/** One Getting started step: once done it is crossed out, with a hanamaru in place of its button. */
function FirstStep({
  index,
  title,
  note,
  done,
  action,
}: {
  index: number;
  title: string;
  /** Progress after the title, e.g. "2 / 3". */
  note?: string;
  done: boolean;
  action: React.ReactNode;
}): React.JSX.Element {
  return (
    <NumberedStep index={index} center>
      <View style={styles.firstStep}>
        <View style={[base.row, base.grow]}>
          <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>
            {title}
          </Text>
          {note && !done ? <Text style={base.caption}>{note}</Text> : null}
        </View>
        {done ? (
          // The teacher's red-pen mark, centered where a Go button sits: a
          // hidden one keeps the spot, so marks line up down the card.
          <View>
            <View
              style={styles.hiddenAction}
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <Button label={copy.today.go} variant="secondary" />
            </View>
            <View style={styles.doneMark} pointerEvents="none">
              <NotoHanamaru size={DONE_MARK_SIZE} />
            </View>
          </View>
        ) : (
          action
        )}
      </View>
    </NumberedStep>
  );
}

/** The hanamaru on a done Getting started step. */
const DONE_MARK_SIZE = 52;

const styles = StyleSheet.create({
  undoLink: {
    ...base.caption,
    alignSelf: 'center',
    padding: space.xs,
  },
  hiddenAction: {
    opacity: 0,
  },
  // Centered over the hidden button, and allowed to spill past it.
  doneMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -DONE_MARK_SIZE,
    right: -DONE_MARK_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-12deg' }],
    opacity: 0.75,
  },
  stepTitleDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  // As tall as a step with a button, so rows don't jump once done.
  firstStep: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: sizes.touch,
  },
  allDone: {
    color: colors.positive,
    fontWeight: fontWeights.bold,
  },
  greeting: {
    flexDirection: 'row',
  },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
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
  plansRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
  },
  mapOpen: {
    ...base.text,
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
  firstOutingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  eyebrow: {
    ...base.label,
    color: colors.accent,
  },
  stepTitle: {
    ...base.text,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.md,
  },
});
