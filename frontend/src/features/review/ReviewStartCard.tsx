import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NotoHanamaru } from '../../components/NotoHanamaru';
import { Icon } from '../../components/Icon';
import { CardStack } from '../../components/shapes';
import { Card, Chip, Facts } from '../../components/ui';
import { copy } from '../../copy';
import { useRootNav } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, fontSizes, fontWeights, space } from '../../styles/tokens';
import type { ReviewCard } from '../../types';
import { formatTimeUntil } from '../../utils/format';

const HANAMARU_SIZE = 140;

/** When the next session is, if the server said; otherwise a general line. */
function caughtUpLine(card: ReviewCard): string {
  const time = card.nextDueAt ? formatTimeUntil(card.nextDueAt) : null;
  return time ? copy.review.caughtUpIn(time) : copy.review.caughtUpBody;
}

/** How many sample Tango the card shows. */
const MAX_SAMPLE = 3;

/**
 * The ink navy "start your review" card (Today and Review tabs). The whole card
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
  // Nothing due: say so instead of "0 Tango · about 0 min", and don't
  // open an empty review.
  if (card.dueCount === 0) {
    return (
      <CardStack dark>
        <Card variant="ink" style={styles.caughtUpCard}>
          {/* The teacher's red-pen mark for work well done, rising past the
              card's corner like a sun. */}
          <View style={styles.hanamaru} pointerEvents="none">
            <NotoHanamaru size={HANAMARU_SIZE} />
          </View>
          <View style={[styles.body, styles.caughtUpBodyRoom]}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.caughtUp}>{copy.review.caughtUp}</Text>
            <Text style={styles.caughtUpBody}>{caughtUpLine(card)}</Text>
          </View>
        </Card>
      </CardStack>
    );
  }
  const shown = card.sample.slice(0, MAX_SAMPLE);
  const more = card.dueCount - shown.length;
  return (
    <CardStack dark>
      <Card variant="ink" onPress={() => nav.navigate('ReviewSession')}>
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
    </CardStack>
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
  // Clips the hanamaru where it runs past the card's edges.
  caughtUpCard: {
    overflow: 'hidden',
  },
  hanamaru: {
    position: 'absolute',
    top: -HANAMARU_SIZE * 0.15,
    right: -HANAMARU_SIZE * 0.15,
    transform: [{ rotate: '-12deg' }],
    opacity: 0.45,
  },
  // Keeps the text clear of the hanamaru.
  caughtUpBodyRoom: {
    paddingRight: HANAMARU_SIZE * 0.7,
  },
  caughtUp: {
    ...base.text,
    color: colors.textInverse,
    fontWeight: fontWeights.bold,
  },
  caughtUpBody: {
    ...base.caption,
    color: colors.textInverse,
  },
});
