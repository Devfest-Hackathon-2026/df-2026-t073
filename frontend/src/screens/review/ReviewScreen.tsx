import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createList } from '../../api/lists';
import { getReviewCard, getReviewSummary } from '../../api/review';
import { listTango } from '../../api/tango';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/layout';
import { Chip, CountBadge, Loadable, SectionTitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import { useRootNav } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, fontWeights, space } from '../../styles/tokens';
import type { Collection } from '../../types';
import { ReviewStartCard } from '../../features/review/ReviewStartCard';
import { NameListSheet } from './ListSheets';
import { TangoRow } from './TangoRow';
import { copy } from '../../copy';

const LINES = copy.review.loadingLines;
const RECENT = 5;

function collectionIcon(c: Collection) {
  if (c.isFavorites) {
    return 'heart' as const;
  }
  if (c.isList) {
    return 'learn' as const;
  }
  return c.isPlace || c.isPlaceCue ? ('pin' as const) : undefined;
}

export function ReviewScreen(): React.JSX.Element {
  const nav = useRootNav();
  const summary = useAsync(getReviewSummary);
  const card = useAsync(getReviewCard);
  const recent = useAsync(() => listTango());
  useReloadOnFocus(summary.reload, card.reload, recent.reload);
  const [naming, setNaming] = useState(false);

  const openCollection = (c: Collection) => {
    if (c.isList) {
      nav.navigate('TangoList', { listId: c.id.slice('list:'.length) });
    } else {
      nav.navigate('ReviewSession', { collectionId: c.id });
    }
  };

  return (
    <Screen edges={['top']}>
      <SectionTitle
        en={copy.review.title}
        jp={copy.review.titleJp}
        size="title"
      />
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
            <View style={base.wrap}>
              {s.collections.map(c => (
                <Chip
                  key={c.id}
                  label={c.label}
                  count={c.count}
                  icon={collectionIcon(c)}
                  tone={c.isPlaceCue || c.isFavorites ? 'accent' : 'outline'}
                  onPress={() => openCollection(c)}
                />
              ))}
              <Chip
                label={copy.lists.newList}
                icon="add"
                tone="outline"
                dashed
                onPress={() => setNaming(true)}
              />
            </View>
          </View>
        )}
      </Loadable>

      <View style={base.rowBetween}>
        <Text style={base.heading}>{copy.review.recentTango}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => nav.navigate('AllTango')}
          style={styles.link}
        >
          <Text style={styles.linkText}>{copy.review.allTango}</Text>
          {summary.data ? (
            <CountBadge count={summary.data.totalTango} />
          ) : null}
          <Icon name="forward" color={colors.accent} />
        </Pressable>
      </View>
      <Loadable state={recent}>
        {list => (
          <View style={base.stackSm}>
            {list.length === 0 ? (
              <Text style={base.caption}>{copy.review.nothingCaught}</Text>
            ) : null}
            {list.slice(0, RECENT).map(t => (
              <TangoRow
                key={t.id}
                tango={t}
                onPress={() => nav.navigate('TangoDetail', { id: t.id })}
              />
            ))}
          </View>
        )}
      </Loadable>

      <NameListSheet
        visible={naming}
        title={copy.lists.newList}
        onClose={() => setNaming(false)}
        onSave={async name => {
          const created = await createList(name);
          summary.reload();
          nav.navigate('TangoList', { listId: created.id });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
  },
  linkText: {
    ...base.text,
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
});
