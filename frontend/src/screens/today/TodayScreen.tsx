import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getToday, searchPlaces } from '../../api/places';
import { type Coords, getCurrentCoords } from '../../location/location';
import { getReviewCard } from '../../api/review';
import { Jp } from '../../components/Jp';
import { TangoMap } from '../../components/TangoMap';
import {
  Button,
  Card,
  Chip,
  Loadable,
  NumberedStep,
  SectionTitle,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
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
  Place,
  ReviewCard,
  TodaySummary,
  Visit,
} from '../../types';
import { formatVisitTime } from '../../utils/format';

const GREETING = {
  text: 'こんにちは',
  reading: 'こんにちは',
  romaji: 'konnichiwa',
  meaning: 'Hello',
};

/** Share of the screen the map gets while the sheet is open (slide 5). */
const MAP_SHARE = 0.42;
/** Height of the sheet's visible strip when the map is expanded. */
const PEEK = sizes.touch + space.xl;
const DRAG_THRESHOLD = 6;

type MapFilter = 'all' | 'stars' | 'planned';

export function TodayScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const today = useAsync(getToday);
  // Device position: the "you are here" pin, and search results near you.
  const [here, setHere] = useState<Coords | null>(null);
  useEffect(() => {
    let alive = true;
    getCurrentCoords().then(coords => alive && setHere(coords));
    return () => {
      alive = false;
    };
  }, []);
  const review = useAsync(getReviewCard);
  const [query, setQuery] = useState('');
  const results = useAsync(() => searchPlaces(query, here), query);

  const [height, setHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<MapFilter>('all');
  const [area, setArea] = useState<MapArea | null>(null);

  // Sheet position: distance of the sheet's top edge from the top of the screen.
  // The animated value holds it as an offset from openTop so the sheet can move
  // with a native-driver transform (no layout work per frame).
  const openTop = Math.round(height * MAP_SHARE);
  const closedTop = Math.max(openTop, height - PEEK);
  const sheetTop = useRef(new Animated.Value(0)).current;
  const topNow = useRef(0);
  const dragStart = useRef(0);

  // Place the sheet once the screen size is known.
  useEffect(() => {
    if (height > 0) {
      const target = expanded ? closedTop : openTop;
      sheetTop.setValue(target - openTop);
      topNow.current = target;
    }
    // Only on size changes; snapping is handled by `snap` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const snap = useMemo(
    () => (toExpanded: boolean) => {
      const target = toExpanded ? closedTop : openTop;
      setExpanded(toExpanded);
      if (!toExpanded) {
        setArea(null);
      }
      Animated.spring(sheetTop, {
        toValue: target - openTop,
        useNativeDriver: true,
        bounciness: 0,
      }).start(() => {
        topNow.current = target;
      });
    },
    [closedTop, openTop, sheetTop],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > DRAG_THRESHOLD,
        onPanResponderGrant: () => {
          sheetTop.stopAnimation(value => {
            topNow.current = value + openTop;
          });
          dragStart.current = topNow.current;
        },
        onPanResponderMove: (_e, g) => {
          const next = Math.min(
            closedTop,
            Math.max(openTop, dragStart.current + g.dy),
          );
          topNow.current = next;
          sheetTop.setValue(next - openTop);
        },
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dy) < DRAG_THRESHOLD) {
            // A tap on the handle toggles.
            snap(dragStart.current < (openTop + closedTop) / 2);
            return;
          }
          const middle = (openTop + closedTop) / 2;
          snap(g.vy > 0.5 || (g.vy > -0.5 && topNow.current > middle));
        },
      }),
    [closedTop, openTop, sheetTop, snap],
  );

  const onLayout = (e: LayoutChangeEvent) =>
    setHeight(e.nativeEvent.layout.height);

  const allPins = useMemo(() => {
    const fromServer = today.data?.pins ?? [];
    // Live data has no "me" pin; add one from the device position.
    if (!here || fromServer.some(p => p.kind === 'me')) {
      return fromServer;
    }
    const me: MapPin = {
      id: 'pin-me',
      label: '',
      count: 0,
      x: 0.5,
      y: 0.5,
      lat: here.lat,
      lng: here.lng,
      kind: 'me',
    };
    return [...fromServer, me];
  }, [today.data, here]);
  const pins = useMemo(
    () =>
      (allPins ?? []).filter(pin => {
        if (!expanded || filter === 'all') {
          return true;
        }
        if (filter === 'stars') {
          return (
            pin.kind === 'me' || (pin.kind === 'tango' && (pin.stars ?? 0) > 0)
          );
        }
        return pin.kind !== 'tango';
      }),
    [allPins, expanded, filter],
  );

  const onPinPress = (pin: MapPin) => {
    const found = today.data?.areas.find(a => a.id === pin.areaId) ?? null;
    if (found && !expanded) {
      snap(true);
    }
    setArea(found);
  };

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* Full-screen and never resized: the sheet slides over it. */}
      <View style={styles.map}>
        <TangoMap
          pins={pins}
          showStars={expanded && filter === 'stars'}
          onPinPress={onPinPress}
          bottomInset={expanded ? PEEK : height - openTop}
        />
      </View>

      {/* Search and filters float over the map */}
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="⌕  Where are you going next?"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
          accessibilityLabel="Search places"
        />
        {query.trim() ? (
          <SearchResults
            places={results.data ?? []}
            loading={results.loading}
            onPick={() => setQuery('')}
          />
        ) : null}
        {expanded && !query.trim() ? (
          <View style={base.row}>
            <Chip
              label="All Tango"
              selected={filter === 'all'}
              tone="outline"
              onPress={() => setFilter('all')}
            />
            <Chip
              label="★ Stars"
              selected={filter === 'stars'}
              tone="outline"
              onPress={() => setFilter('stars')}
            />
            <Chip
              label="Planned"
              selected={filter === 'planned'}
              tone="outline"
              onPress={() => setFilter('planned')}
            />
          </View>
        ) : null}
        {expanded && area && !query.trim() ? (
          <AreaCard area={area} onClose={() => setArea(null)} />
        ) : null}
      </View>

      {/* Bottom sheet */}
      {height > 0 ? (
        <Animated.View
          style={[
            styles.sheet,
            {
              top: openTop,
              height: height - openTop,
              transform: [{ translateY: sheetTop }],
            },
          ]}
        >
          <View
            {...panResponder.panHandlers}
            style={styles.handleArea}
            accessibilityRole="adjustable"
            accessibilityLabel={
              expanded
                ? 'Pull up to close the map'
                : 'Pull down to explore your map'
            }
          >
            <View style={styles.handle} />
            {expanded ? (
              <PeekSummary
                visit={today.data?.upNext ?? null}
                card={review.data}
              />
            ) : (
              <Text style={base.caption}>Pull down to explore your map</Text>
            )}
          </View>
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <Loadable state={today}>
              {summary =>
                settings.dayOne ? (
                  <DayOne summary={summary} />
                ) : (
                  <Regular summary={summary} review={review.data} />
                )
              }
            </Loadable>
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

function PeekSummary({
  visit,
  card,
}: {
  visit: Visit | null;
  card: ReviewCard | undefined;
}): React.JSX.Element {
  return (
    <View style={base.row}>
      {visit ? (
        <>
          <Text style={styles.peekStrong}>Tomorrow:</Text>
          <Jp {...visit.place.name} bold size="sm" />
        </>
      ) : null}
      {card ? (
        <Text style={base.caption}>
          · <Text style={styles.peekStrong}>{card.dueCount}</Text> to review
        </Text>
      ) : null}
    </View>
  );
}

function AreaCard({
  area,
  onClose,
}: {
  area: MapArea;
  onClose: () => void;
}): React.JSX.Element {
  const nav = useRootNav();
  return (
    <Card style={styles.areaCard}>
      <View style={base.rowBetween}>
        <Text style={base.heading}>{area.label}</Text>
        <Pressable onPress={onClose} accessibilityLabel="Close area card">
          <Text style={base.caption}>
            {area.tangoCount} Tango · {area.placeCount} places ✕
          </Text>
        </Pressable>
      </View>
      <View style={base.wrap}>
        {area.sample.map(t => (
          <Chip
            key={t.id}
            jp={t}
            icon={t.known ? '★' : undefined}
            tone={t.known ? 'star' : 'default'}
            onPress={() => nav.navigate('TangoDetail', { id: t.id })}
          />
        ))}
        {area.moreCount > 0 ? (
          <Text style={base.caption}>+{area.moreCount}</Text>
        ) : null}
      </View>
      <View style={base.row}>
        <Button
          label="Review these"
          variant="secondary"
          style={base.grow}
          onPress={() =>
            nav.navigate('ReviewSession', { collectionId: `area:${area.id}` })
          }
        />
        {area.planPlaceId ? (
          <Button
            label="Plan a visit"
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

function SearchResults({
  places,
  loading,
  onPick,
}: {
  places: Place[];
  loading: boolean;
  onPick: () => void;
}): React.JSX.Element {
  const nav = useRootNav();
  return (
    <View style={styles.results}>
      {!loading && places.length === 0 ? (
        <Text style={base.caption}>No places found (mock search).</Text>
      ) : null}
      {places.map(place => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          style={styles.result}
          onPress={() => {
            onPick();
            nav.navigate('Prepare', { placeId: place.id });
          }}
        >
          <Jp {...place.name} bold />
          <Text style={base.caption}>
            {place.category} · {place.area} · tap to plan a visit
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Regular({
  summary,
  review,
}: {
  summary: TodaySummary;
  review: ReviewCard | undefined;
}): React.JSX.Element {
  return (
    <>
      <Greeting name={summary.userName} />
      {summary.upNext ? <UpNextCard visit={summary.upNext} /> : null}
      {review ? <ReviewCardView card={review} /> : null}
      <Text style={base.caption}>
        Hold anything with a dotted underline to see it in English.
      </Text>
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
            icon={tango.sightings.length ? '⌖' : undefined}
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
              <Text style={base.caption}>Signs count, so do menus</Text>
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
                nav.navigate('Rehearse', { placeId: 'menya-taiki' })
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
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  search: {
    ...base.text,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: space.lg,
    minHeight: sizes.touch,
  },
  results: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.sm,
    gap: space.xs,
  },
  result: {
    padding: space.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  areaCard: {
    marginTop: space.xl,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    gap: space.xs,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    minHeight: PEEK,
  },
  handle: {
    width: sizes.touch,
    height: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  sheetContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  peekStrong: {
    ...base.text,
    fontSize: fontSizes.sm,
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
