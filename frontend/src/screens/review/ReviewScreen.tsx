import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createList } from '../../api/lists';
import { getReviewSummary } from '../../api/review';
import { listTango } from '../../api/tango';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/layout';
import {
  Button,
  Card,
  Chip,
  Loadable,
  SectionTitle,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import { useRootNav } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, fontWeights, space } from '../../styles/tokens';
import type { Collection } from '../../types';
import { NameListSheet } from './ListSheets';
import { TangoRow } from './TangoRow';

const LINES = ['Counting what is due…', 'Sorting your collections…'];
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
  const recent = useAsync(() => listTango());
  useReloadOnFocus(summary.reload, recent.reload);
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
        en="Review"
        jp={{ text: '復習', reading: 'ふくしゅう', romaji: 'fukushū' }}
        size="title"
      />
      <Loadable state={summary} messages={LINES}>
        {s => (
          <View style={base.stack}>
            <Card variant="dark">
              <View style={base.rowBetween}>
                <View style={base.grow}>
                  <Text style={styles.eyebrow}>Quick review</Text>
                  <Text style={styles.bigInverse}>
                    {s.dueCount} due · {s.minutes} min
                  </Text>
                </View>
                <Button
                  label="Start"
                  variant="light"
                  onPress={() => nav.navigate('ReviewSession')}
                />
              </View>
            </Card>

            <Text style={base.heading}>Collections</Text>
            <View style={base.wrap}>
              {s.collections.map(c => (
                <Chip
                  key={c.id}
                  label={`${c.label} · ${c.count}`}
                  icon={collectionIcon(c)}
                  tone={c.isPlaceCue || c.isFavorites ? 'accent' : 'outline'}
                  onPress={() => openCollection(c)}
                />
              ))}
              <Chip
                label="New list"
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
        <Text style={base.heading}>Recent Tango</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => nav.navigate('AllTango')}
          style={styles.link}
        >
          <Text style={styles.linkText}>
            All Tango{summary.data ? ` · ${summary.data.totalTango}` : ''}
          </Text>
          <Icon name="forward" color={colors.accent} />
        </Pressable>
      </View>
      <Loadable state={recent}>
        {list => (
          <View style={base.stackSm}>
            {list.length === 0 ? (
              <Text style={base.caption}>Nothing caught yet</Text>
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
        title="New list"
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
  eyebrow: {
    ...base.label,
    color: colors.textInverse,
  },
  bigInverse: {
    ...base.heading,
    color: colors.textInverse,
  },
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
