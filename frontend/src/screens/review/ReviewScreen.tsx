import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { getReviewSummary } from '../../api/review';
import { listTango } from '../../api/tango';
import { Jp } from '../../components/Jp';
import { Screen } from '../../components/layout';
import {
  Button,
  Card,
  Chip,
  Loadable,
  SectionTitle,
  StrengthBar,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useRootNav } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, radii, sizes, space } from '../../styles/tokens';

export function ReviewScreen(): React.JSX.Element {
  const nav = useRootNav();
  const summary = useAsync(getReviewSummary);
  const [query, setQuery] = useState('');
  const tango = useAsync(() => listTango(query), query);

  return (
    <Screen edges={['top']}>
      <SectionTitle
        en="Review"
        jp={{ text: '復習', reading: 'ふくしゅう', romaji: 'fukushū' }}
        size="title"
      />
      <Loadable state={summary}>
        {s => (
          <View style={base.stack}>
            <Card variant="dark">
              <Text style={styles.eyebrow}>Quick review</Text>
              <View style={base.rowBetween}>
                <View style={base.grow}>
                  <Text style={styles.bigInverse}>
                    {s.dueCount} due · {s.minutes} min
                  </Text>
                  <Text style={styles.captionInverse}>
                    Includes {s.placeCueCount} Tango with a place cue
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
                  icon={c.isPlace ? '⌖' : undefined}
                  tone={c.isPlaceCue ? 'accent' : 'outline'}
                  onPress={() => nav.navigate('ReviewSession', { collectionId: c.id })}
                />
              ))}
            </View>

            <Text style={base.heading}>Exercise types</Text>
            <View style={base.wrap}>
              {s.exerciseTypes.map(type => (
                <Chip
                  key={type.id}
                  label={type.label}
                  selected={type.enabled}
                  tone="outline"
                />
              ))}
            </View>
            <Text style={base.caption}>
              New Tango start as multiple choice, then move to typing and speaking
              as you learn them.
            </Text>

            <View style={base.rowBetween}>
              <Text style={base.heading}>All Tango</Text>
              <Text style={base.caption}>{s.totalTango}</Text>
            </View>
          </View>
        )}
      </Loadable>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="⌕  Search Tango or places"
        placeholderTextColor={colors.textMuted}
        style={styles.search}
        accessibilityLabel="Search Tango or places"
      />
      <Loadable state={tango}>
        {list => (
          <View style={base.stackSm}>
            {list.length === 0 ? (
              <Text style={base.caption}>No Tango match “{query}”.</Text>
            ) : null}
            {list.map(t => (
              <Card key={t.id} onPress={() => nav.navigate('TangoDetail', { id: t.id })}>
                <View style={base.rowBetween}>
                  <Jp {...t} bold size="lg" />
                  <View style={styles.strength}>
                    <StrengthBar strength={t.strength} />
                  </View>
                </View>
                <Text style={base.caption}>
                  {t.meaning}
                  {t.sightings[0] ? ` · ${t.sightings[0].placeName}` : ''}
                </Text>
              </Card>
            ))}
          </View>
        )}
      </Loadable>
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
  captionInverse: {
    ...base.caption,
    color: colors.textInverse,
  },
  search: {
    ...base.text,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    minHeight: sizes.touch,
  },
  strength: {
    width: sizes.mapHeight / 2,
  },
});
