import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  RefreshControl,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createList, listLists } from '../../api/lists';
import { getReviewCard, getReviewSummary } from '../../api/review';
import { listTango } from '../../api/tango';
import { Icon } from '../../components/Icon';
import { PickSheet } from '../../components/PickSheet';
import { Chip, CountBadge, Loadable, SectionTitle } from '../../components/ui';
import {
  PAGE_SIZE,
  pageNumbers,
  sortFilterTango,
  TANGO_FILTERS,
  TANGO_SORTS,
  tangoPlaces,
  type TangoFilter,
  type TangoSort,
} from '../../features/tango/sortFilter';
import { useCachedAsync } from '../../hooks/useCachedAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import { useRootNav } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, fontWeights, radii, sizes, space } from '../../styles/tokens';
import type { Collection } from '../../types';
import { ReviewStartCard } from '../../features/review/ReviewStartCard';
import { collectionTango } from '../../features/review/collectionTango';
import { CollectionSheet } from './CollectionSheet';
import { NameListSheet } from './ListSheets';
import { TangoRow } from './TangoRow';
import { copy } from '../../copy';

const LINES = copy.review.loadingLines;
const TANGO_LINES = copy.allTango.loadingLines;
/** The "any place" / "any list" choice in the pick sheets. */
const ANY = '';
/** Index of the search and filters among the scroll view's children. */
const STICKY_CONTROLS = 3;
const COLLECTION_WIDTH = 140;

type Picking = 'sort' | 'place' | 'list' | null;

function collectionIcon(c: Collection) {
  if (c.isFavorites) {
    return 'heart' as const;
  }
  if (c.isList) {
    return 'learn' as const;
  }
  return c.isPlace || c.isPlaceCue ? ('pin' as const) : undefined;
}

/**
 * The Tango tab: quick review, collections, then every Tango (newest first)
 * with search, filters and sorting that stay at the top while scrolling.
 */
export function ReviewScreen(): React.JSX.Element {
  const nav = useRootNav();
  const summary = useCachedAsync('review:summary', getReviewSummary);
  const card = useCachedAsync('review:card', getReviewCard);
  const lists = useCachedAsync('lists:all', listLists);
  const [query, setQuery] = useState('');
  const tango = useCachedAsync(
    `tango:list:${query}`,
    () => listTango(query),
    query,
  );
  // Every Tango, unaffected by the search, for the collection sheet.
  const everything = useCachedAsync('tango:list:all', () => listTango());
  useReloadOnFocus(
    summary.revalidate,
    card.revalidate,
    lists.revalidate,
    tango.revalidate,
    everything.revalidate,
  );
  const [opened, setOpened] = useState<Collection | null>(null);
  const [naming, setNaming] = useState(false);

  const [filter, setFilter] = useState<TangoFilter>('all');
  const [sort, setSort] = useState<TangoSort>('newest');
  // Kept with its name, so the chip still reads right while searching.
  const [place, setPlace] = useState<{ id: string; name: string } | null>(null);
  const [listId, setListId] = useState(ANY);
  const [picking, setPicking] = useState<Picking>(null);
  const [page, setPage] = useState(1);

  const [pullRefreshing, setPullRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([
        summary.reload(),
        card.reload(),
        lists.reload(),
        tango.reload(),
        everything.reload(),
      ]);
    } finally {
      setPullRefreshing(false);
    }
  }, [summary, card, lists, tango, everything]);

  const scroll = useRef<ScrollViewInstance>(null);
  // Where the list starts, and how tall the pinned controls are over it.
  const listY = useRef(0);
  const controlsHeight = useRef(0);
  const goToPage = (next: number) => {
    setPage(next);
    // Back to the top of the list, under the pinned controls.
    scroll.current?.scrollTo({
      y: Math.max(0, listY.current - controlsHeight.current),
      animated: false,
    });
  };

  const chosenList = lists.data?.find(l => l.id === listId);
  const places = tangoPlaces(tango.data ?? []);
  const shown = sortFilterTango(tango.data ?? [], filter, sort, {
    placeId: place?.id,
    listTangoIds: chosenList?.tangoIds,
  });
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  // Every row would name the same place: leave it out.
  const samePlace = !!place || places.length <= 1;

  // New search, filter or sort: start from the first page.
  useEffect(() => {
    setPage(1);
  }, [query, filter, sort, place?.id, listId]);

  const openCollection = (c: Collection) => setOpened(c);

  const filtered =
    filter !== 'all' || !!place || !!chosenList || query.trim() !== '';

  return (
    <SafeAreaView style={base.screen} edges={['top']}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={base.content}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[STICKY_CONTROLS]}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            tintColor={colors.accent}
          />
        }
      >
        {/* 0 */}
        <SectionTitle en={copy.review.title} size="title" />

        {/* 1 */}
        <Loadable state={summary} messages={LINES}>
          {s => (
            <View style={base.stack}>
              {card.data ? (
                <ReviewStartCard
                  card={card.data}
                  title={copy.review.quickReview}
                />
              ) : null}

              <Text style={base.heading}>{copy.review.collections}</Text>
              {/* Cards, not pills: they open a collection, unlike the
                  filter chips further down. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.collections}
                contentContainerStyle={styles.collectionsContent}
              >
                {s.collections.map(c => (
                  <CollectionCard
                    key={c.id}
                    collection={c}
                    onPress={() => openCollection(c)}
                  />
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setNaming(true)}
                  style={[styles.collection, styles.collectionNew]}
                >
                  <View
                    style={[styles.collectionShape, styles.collectionShapeNew]}
                  />
                  <Icon name="add" color={colors.textMuted} />
                  <Text style={styles.collectionLabel}>
                    {copy.lists.newList}
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          )}
        </Loadable>

        {/* 2 */}
        <View style={styles.heading}>
          <Text style={base.heading}>{copy.allTango.title}</Text>
          {summary.data ? <CountBadge count={summary.data.totalTango} /> : null}
        </View>

        {/* 3: pinned to the top while scrolling. The pinned wrapper drops
            its child's own style, so the styled controls sit one level in. */}
        <View>
          <View
            style={styles.controls}
            onLayout={e => {
              controlsHeight.current = e.nativeEvent.layout.height;
            }}
          >
            <View style={styles.search}>
              <Icon name="search" color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={copy.allTango.searchPlaceholder}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                accessibilityLabel={copy.allTango.searchA11y}
              />
            </View>
            <View style={styles.chipRows}>
              <View style={base.wrap}>
                {TANGO_FILTERS.map(f => (
                  <Chip
                    key={f}
                    label={copy.allTango.filters[f]}
                    icon={f === 'stamped' ? 'hanamaru' : undefined}
                    tone="outline"
                    selected={filter === f}
                    onPress={() => setFilter(f)}
                  />
                ))}
              </View>
              <View style={base.wrap}>
                <Chip
                  icon="sort"
                  label={copy.allTango.sorts[sort]}
                  tone="outline"
                  onPress={() => setPicking('sort')}
                />
                {places.length > 0 || place ? (
                  <Chip
                    icon="pin"
                    label={place?.name ?? copy.allTango.anyPlace}
                    tone="outline"
                    selected={!!place}
                    onPress={() => setPicking('place')}
                  />
                ) : null}
                {lists.data?.length ? (
                  <Chip
                    icon="learn"
                    label={chosenList?.name ?? copy.allTango.anyList}
                    tone="outline"
                    selected={!!chosenList}
                    onPress={() => setPicking('list')}
                  />
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* 4 */}
        <View
          onLayout={e => {
            listY.current = e.nativeEvent.layout.y;
          }}
        >
          <Loadable state={tango} messages={TANGO_LINES}>
            {() => (
              <View style={base.stackSm}>
                {shown.length === 0 ? (
                  <Text style={base.caption}>
                    {filtered
                      ? copy.allTango.noMatches
                      : copy.review.nothingCaught}
                  </Text>
                ) : null}
                {shown
                  .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                  .map(t => (
                    <TangoRow
                      key={t.id}
                      tango={t}
                      hidePlace={samePlace}
                      onPress={() => nav.navigate('TangoDetail', { id: t.id })}
                    />
                  ))}
              </View>
            )}
          </Loadable>
        </View>

        {/* 5 */}
        <Pager page={page} pages={pages} onPage={goToPage} />
      </ScrollView>

      <PickSheet
        visible={picking === 'sort'}
        title={copy.allTango.sortBy}
        options={TANGO_SORTS.map(s => ({
          key: s,
          label: copy.allTango.sorts[s],
        }))}
        value={sort}
        onPick={setSort}
        onClose={() => setPicking(null)}
      />
      <PickSheet
        visible={picking === 'place'}
        title={copy.allTango.place}
        options={[
          { key: ANY, label: copy.allTango.anyPlace },
          ...places.map(p => ({ key: p.id, label: p.name, count: p.count })),
        ]}
        value={place?.id ?? ANY}
        onPick={id => {
          const picked = places.find(p => p.id === id);
          setPlace(picked ? { id: picked.id, name: picked.name } : null);
        }}
        onClose={() => setPicking(null)}
      />
      <PickSheet
        visible={picking === 'list'}
        title={copy.allTango.list}
        options={[
          { key: ANY, label: copy.allTango.anyList },
          ...(lists.data ?? []).map(l => ({
            key: l.id,
            label: l.name,
            count: l.tangoIds.length,
          })),
        ]}
        value={chosenList?.id ?? ANY}
        onPick={setListId}
        onClose={() => setPicking(null)}
      />
      <CollectionSheet
        collection={opened}
        tango={
          opened
            ? collectionTango(opened, everything.data ?? [], lists.data ?? [])
            : null
        }
        onClose={() => setOpened(null)}
        onPractice={() => {
          const id = opened!.id;
          setOpened(null);
          nav.navigate('ReviewSession', { collectionId: id });
        }}
        onOpenTango={id => {
          setOpened(null);
          nav.navigate('TangoDetail', { id });
        }}
        onEditList={
          opened?.isList
            ? () => {
                const openedList = opened.id.slice('list:'.length);
                setOpened(null);
                nav.navigate('TangoList', { listId: openedList });
              }
            : undefined
        }
      />
      <NameListSheet
        visible={naming}
        title={copy.lists.newList}
        onClose={() => setNaming(false)}
        onSave={async name => {
          const created = await createList(name);
          summary.reload();
          lists.reload();
          nav.navigate('TangoList', { listId: created.id });
        }}
      />
    </SafeAreaView>
  );
}

/** A collection as a small card: icon, name and how many Tango. */
function CollectionCard({
  collection: c,
  onPress,
}: {
  collection: Collection;
  onPress: () => void;
}): React.JSX.Element {
  const icon = collectionIcon(c) ?? 'tango';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.collection}
    >
      <View style={styles.collectionShape} />
      {/* A solid heart for Favorites, like the hearts on Tango. */}
      <Icon name={icon} color={colors.accent} filled={c.isFavorites} />
      <Text style={styles.collectionLabel} numberOfLines={2}>
        {c.label}
      </Text>
      <Text style={base.caption}>{copy.common.tangoCount(c.count)}</Text>
    </Pressable>
  );
}

/** Page buttons under the list: ‹ 1 … 4 5 6 … 10 ›. Hidden with one page. */
function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}): React.JSX.Element {
  if (pages <= 1) {
    return <View />;
  }
  return (
    <View style={styles.pager}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.allTango.prevPage}
        disabled={page === 1}
        onPress={() => onPage(page - 1)}
        style={[styles.pageButton, page === 1 && styles.pageDisabled]}
      >
        <Icon name="back" color={colors.text} />
      </Pressable>
      {pageNumbers(page, pages).map((p, i) =>
        p === 'gap' ? (
          <Text key={`gap-${i}`} style={styles.pageGap}>
            …
          </Text>
        ) : (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityLabel={copy.allTango.pageA11y(p)}
            accessibilityState={{ selected: p === page }}
            onPress={() => onPage(p)}
            style={[styles.pageButton, p === page && styles.pageCurrent]}
          >
            <Text
              style={[styles.pageText, p === page && styles.pageTextCurrent]}
            >
              {p}
            </Text>
          </Pressable>
        ),
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.allTango.nextPage}
        disabled={page === pages}
        onPress={() => onPage(page + 1)}
        style={[styles.pageButton, page === pages && styles.pageDisabled]}
      >
        <Icon name="forward" color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Well apart from Collections, close to the search under it.
  // Edge to edge, so cards scroll in from the screen's sides.
  collections: {
    marginHorizontal: -space.lg,
  },
  // Room around the cards so their tilted corners aren't cut off.
  collectionsContent: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.md,
  },
  collection: {
    width: COLLECTION_WIDTH,
    padding: space.md,
    gap: space.xs,
  },
  collectionNew: {
    justifyContent: 'center',
  },
  // The card itself, tilted behind its text (which stays straight).
  collectionShape: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    transform: [{ rotate: '-2deg' }],
  },
  collectionShapeNew: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  collectionLabel: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
    marginBottom: -space.md,
  },
  // Full width with the page's background, so rows scroll out of sight
  // under it.
  controls: {
    backgroundColor: colors.bg,
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.lg,
  },
  chipRows: {
    gap: space.sm,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    minHeight: sizes.touch,
  },
  input: {
    ...base.text,
    flex: 1,
    paddingVertical: 0,
  },
  pager: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
  pageButton: {
    minWidth: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageCurrent: {
    backgroundColor: colors.accent,
  },
  pageDisabled: {
    opacity: 0.3,
  },
  pageText: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  pageTextCurrent: {
    color: colors.textInverse,
  },
  pageGap: {
    ...base.caption,
  },
});
