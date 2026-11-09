import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  playWord,
  SAVE_ICON,
  SAVE_LABEL,
  useSaveWord,
} from '../features/tango/saveWord';
import { Icon } from './Icon';
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
import { copy } from '../copy';

type Size = keyof typeof fontSizes;
type Tone = 'default' | 'muted' | 'inverse' | 'accent';

export interface JpProps extends JpText {
  /** Dotted underline; tap shows the meaning, plays it and can save it. */
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
  const saver = useSaveWord({ text, reading, meaning });

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
        onPress={() => setOpen(true)}
        onLongPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityHint={copy.jp.peekHint}
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
          {/* Taps inside the card don't close it. */}
          <Pressable style={styles.peek} onPress={() => {}}>
            <View style={base.rowBetween}>
              <Text style={styles.peekMeaning}>
                {meaning ?? copy.jp.noMeaning}
              </Text>
              <Pressable
                style={styles.audio}
                onPress={() => playWord(text)}
                accessibilityLabel={copy.common.play(text)}
              >
                <Icon name="play" color={colors.textInverse} />
              </Pressable>
            </View>
            <Text style={styles.peekReading}>
              {[text, reading, romaji].filter(Boolean).join(' · ')}
            </Text>
            <Pressable
              style={[styles.save, saver.busy && styles.saveDone]}
              disabled={saver.busy}
              onPress={saver.save}
              accessibilityRole="button"
            >
              <View style={styles.saveRow}>
                {SAVE_ICON[saver.state] ? (
                  <Icon
                    name={SAVE_ICON[saver.state]!}
                    size={fontSizes.md}
                    color={colors.textInverse}
                  />
                ) : null}
                <Text style={styles.saveText}>{SAVE_LABEL[saver.state]}</Text>
              </View>
            </Pressable>
          </Pressable>
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
  // Shrinks and wraps inside rows, so long words or readings never overflow.
  column: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
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
  save: {
    marginTop: space.sm,
    minHeight: sizes.touch,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  saveDone: {
    backgroundColor: colors.overlay,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  saveText: {
    ...base.text,
    color: colors.textInverse,
    fontWeight: fontWeights.bold,
  },
});
