// Shapes that give the app its own look: card stacks, tickets, red pen marks.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { base } from '../styles/base';
import { colors, radii, sizes, space } from '../styles/tokens';

// ---------- Card stack ----------

/**
 * A card with a second card peeking out below it, like a deck of flashcards.
 * `dark` is for dark cards (a deck to review).
 */
export function CardStack({
  dark = false,
  children,
}: {
  dark?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.stack}>
      <View
        style={[
          styles.stackBack,
          dark ? styles.stackBackDark : styles.stackBackLight,
        ]}
      />
      {children}
    </View>
  );
}

// ---------- Ticket ----------

const DASHES = Array.from({ length: 40 }, (_, i) => i);

/**
 * A ticket for a planned visit: the details on the left, a stub on the right
 * (e.g. Prepare), split by a tear line with a small notch at each end.
 */
export function TicketCard({
  ink = false,
  stub,
  onPress,
  children,
}: {
  /** The ink navy ticket (Up next); otherwise white. */
  ink?: boolean;
  stub: React.ReactNode;
  onPress?: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const content = (
    <>
      <View style={styles.ticketMain}>{children}</View>
      <View style={styles.ticketStub}>
        <View style={styles.tear} pointerEvents="none">
          {DASHES.map(i => (
            <View key={i} style={[styles.dash, ink && styles.dashInk]} />
          ))}
        </View>
        <View style={[styles.notch, styles.notchTop]} pointerEvents="none" />
        <View style={[styles.notch, styles.notchBottom]} pointerEvents="none" />
        {stub}
      </View>
    </>
  );
  const style = [base.card, styles.ticket, ink && styles.ticketInk];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={style}>
        {content}
      </Pressable>
    );
  }
  return <View style={style}>{content}</View>;
}

// ---------- Red pen underline ----------

/** A hand-drawn red stroke under a title. Use sparingly. */
export function RedPenUnderline({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.penWrap}>
      {children}
      <View style={styles.pen} pointerEvents="none">
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 9"
          preserveAspectRatio="none"
        >
          <Path
            d="M2 6 C 25 2, 55 8, 98 3"
            fill="none"
            stroke={colors.hanamaru}
            strokeWidth={2.6}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
      </View>
    </View>
  );
}

const NOTCH = 12;

const styles = StyleSheet.create({
  stack: {
    // Room for the card peeking out below.
    marginBottom: space.sm,
  },
  stackBack: {
    position: 'absolute',
    top: space.sm,
    left: space.md,
    right: space.md,
    bottom: -space.sm,
    borderRadius: radii.lg,
    borderWidth: sizes.hairline,
  },
  stackBackLight: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  stackBackDark: {
    backgroundColor: colors.deckBack,
    borderColor: colors.deckBack,
  },
  ticket: {
    flexDirection: 'row',
    padding: 0,
    gap: 0,
    borderRadius: radii.md,
  },
  ticketInk: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  ticketMain: {
    flex: 1,
    minWidth: 0,
    padding: space.lg,
    gap: space.sm,
  },
  ticketStub: {
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
  },
  tear: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: sizes.border,
    overflow: 'hidden',
    gap: space.xs,
  },
  dash: {
    width: sizes.border,
    height: space.sm,
    backgroundColor: colors.border,
  },
  dashInk: {
    backgroundColor: colors.inverseBorder,
  },
  notch: {
    position: 'absolute',
    left: -NOTCH / 2 + sizes.border / 2,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    // Cut out of the card: the screen's background shows through.
    backgroundColor: colors.bg,
  },
  notchTop: {
    top: -NOTCH / 2 - sizes.hairline,
  },
  notchBottom: {
    bottom: -NOTCH / 2 - sizes.hairline,
  },
  penWrap: {
    alignSelf: 'flex-start',
  },
  pen: {
    position: 'absolute',
    left: -space.xs,
    right: -space.sm,
    bottom: -space.sm,
    height: space.sm,
  },
});
