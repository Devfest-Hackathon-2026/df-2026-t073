import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../state/SettingsContext';
import { base } from '../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../styles/tokens';
import type { JpText } from '../types';

type Size = keyof typeof fontSizes;
type Tone = 'default' | 'muted' | 'inverse' | 'accent';

export interface JpProps extends JpText {
  /** Dotted underline; long-press shows the English meaning. */
  peek?: boolean;
  size?: Size;
  bold?: boolean;
  tone?: Tone;
  /** Force kanji (signs and menus always show the real kanji). */
  alwaysKanji?: boolean;
}

const DOT_COUNT = 80;
const DOTS = Array.from({ length: DOT_COUNT }, (_, i) => i);

/**
 * All Japanese text goes through this component. It follows the
 * "Show Japanese as" and furigana settings.
 */
export function Jp({
  text,
  reading,
  romaji,
  meaning,
  peek = false,
  size = 'md',
  bold = false,
  tone = 'default',
  alwaysKanji = false,
}: JpProps): React.JSX.Element {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);

  const mode = alwaysKanji ? 'kanji' : settings.showJapaneseAs;
  let shown = text;
  if (mode === 'romaji' && romaji) {
    shown = romaji;
  } else if (mode === 'hiragana' && reading) {
    shown = reading;
  }
  const showFurigana =
    settings.furigana && mode === 'kanji' && !!reading && reading !== text;

  const textStyle = [
    styles.text,
    sizeStyles[size],
    bold && styles.bold,
    toneStyles[tone],
  ];

  const body = (
    <View style={[styles.column, peek && styles.columnPeek]}>
      {showFurigana ? (
        <Text style={[styles.furigana, toneStyles[tone]]}>{reading}</Text>
      ) : null}
      <Text style={textStyle}>{shown}</Text>
      {peek ? (
        <View style={styles.dots}>
          {DOTS.map(i => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
      ) : null}
    </View>
  );

  if (!peek) {
    return body;
  }

  return (
    <>
      <Pressable
        onLongPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityHint="Long press to see the English meaning"
      >
        {body}
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <View style={styles.peek}>
            <View style={base.rowBetween}>
              <Text style={styles.peekMeaning}>{meaning ?? 'No meaning yet'}</Text>
              <Pressable
                style={styles.audio}
                disabled
                accessibilityLabel="Play audio (coming soon)"
              >
                <Text style={styles.audioIcon}>🔈</Text>
              </Pressable>
            </View>
            <Text style={styles.peekReading}>
              {[text, reading, romaji].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const sizeStyles = StyleSheet.create({
  xs: { fontSize: fontSizes.xs },
  sm: { fontSize: fontSizes.sm },
  md: { fontSize: fontSizes.md },
  lg: { fontSize: fontSizes.lg },
  xl: { fontSize: fontSizes.xl },
  xxl: { fontSize: fontSizes.xxl },
  jumbo: { fontSize: fontSizes.jumbo },
});

const toneStyles = StyleSheet.create({
  default: { color: colors.text },
  muted: { color: colors.textMuted },
  inverse: { color: colors.textInverse },
  accent: { color: colors.accent },
});

const styles = StyleSheet.create({
  column: {
    alignSelf: 'flex-start',
  },
  text: {
    ...base.text,
  },
  bold: {
    fontWeight: fontWeights.bold,
  },
  furigana: {
    ...base.text,
    fontSize: fontSizes.xs,
    textAlign: 'center',
  },
  columnPeek: {
    paddingBottom: sizes.dot,
  },
  // Pinned to the bottom edge so the row takes the text's width; extra dots are clipped.
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: sizes.dot,
    height: sizes.dot,
    overflow: 'hidden',
  },
  dot: {
    width: sizes.dot,
    height: sizes.dot,
    borderRadius: sizes.dot,
    backgroundColor: colors.textMuted,
  },
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: space.xl,
  },
  peek: {
    backgroundColor: colors.dark,
    borderRadius: radii.md,
    padding: space.lg,
    gap: space.xs,
  },
  peekMeaning: {
    ...base.text,
    color: colors.textInverse,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.lg,
    flexShrink: 1,
  },
  peekReading: {
    ...base.text,
    color: colors.textInverse,
    fontSize: fontSizes.sm,
  },
  audio: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioIcon: {
    fontSize: fontSizes.md,
    color: colors.textInverse,
  },
});
