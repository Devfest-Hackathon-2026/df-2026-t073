import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Card, Chip, Facts } from '../../components/ui';
import { copy } from '../../copy';
import { useRootNav } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, fontSizes, space } from '../../styles/tokens';
import type { ReviewCard } from '../../types';

/** How many sample Tango the card shows. */
const MAX_SAMPLE = 3;

/**
 * The dark "start your review" card (Today and Review tabs). The whole card
 * starts the review; the chips open their Tango.
 */
export function ReviewStartCard({
  card,
  title,
}: {
  card: ReviewCard;
  title: string;
}): React.JSX.Element {
  const nav = useRootNav();
  const shown = card.sample.slice(0, MAX_SAMPLE);
  const more = card.dueCount - shown.length;
  return (
    <Card variant="dark" onPress={() => nav.navigate('ReviewSession')}>
      <View style={base.rowBetween}>
        <View style={[base.grow, styles.body]}>
          <Text style={styles.title}>{title}</Text>
          <View style={base.wrap}>
            {shown.map(tango => (
              <Chip
                key={tango.id}
                jp={tango}
                tone="inverse"
                onPress={() => nav.navigate('TangoDetail', { id: tango.id })}
              />
            ))}
            {more > 0 ? (
              <Chip label={copy.today.more(more)} tone="inverse" dashed />
            ) : null}
          </View>
          <Facts
            inverse
            items={[
              { icon: 'tango', text: copy.common.tangoCount(card.dueCount) },
              { icon: 'time', text: copy.common.aboutMinutes(card.minutes) },
            ]}
          />
        </View>
        <Icon name="forward" size={fontSizes.lg} color={colors.textInverse} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.sm,
  },
  title: {
    ...base.heading,
    color: colors.textInverse,
  },
});
