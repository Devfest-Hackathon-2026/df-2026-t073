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
  /** Center the word (and its furigana) in its row, e.g. in a centered hero. */
  center?: boolean;
  /** False to never show furigana, e.g. for place names. */
  furigana?: boolean;
  /**
   * Keep an empty furigana line over words without furigana, so they line
   * up with words that have it. Off inside pills, which center their word.
   */
  keepFuriganaLine?: boolean;
}

const DOT_COUNT = 80;
/** Furigana only goes over kanji; kana text reads fine on its own. */
const KANJI = /[\u3400-\u4dbf\u4e00-\u9fff々]/;
/**
 * Furigana size for each word size. Small words keep a readable minimum;
 * large words get furigana well under half their size.
 */
const FURIGANA_SIZE: Record<Size, number> = {
  xs: 8,
  sm: 9,
  md: 10,
  lg: 11,
  xl: 12,
  xxl: 14,
  jumbo: 18,
};
/** Furigana line height, as a multiple of its font size. */
const FURIGANA_LINE = 1.2;
/**
 * How far the furigana is pulled down into the word's line, as a share of
 * the word's size; the line has empty space above the glyphs.
 */
const FURIGANA_TUCK = 0.15;
/** How far a long reading may stick out past its word on each side. */
const FURIGANA_OVERHANG = 100;
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
  center = false,
  furigana = true,
  keepFuriganaLine = true,
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
  // With furigana on, every word keeps the furigana line (blank when there
  // is nothing to show), so words with and without it line up.
  const furiganaOn = furigana && settings.furigana && mode === 'kanji';
  const showFurigana =
    furiganaOn && !!reading && reading !== text && KANJI.test(text);
  const furiganaLine = showFurigana || (furiganaOn && keepFuriganaLine);

  const textStyle = [
    styles.text,
    sizeStyles[size],
    bold && styles.bold,
    toneStyles[tone],
    center && styles.textCenter,
  ];

  const body = (
    <View
      style={[
        styles.column,
        peek && styles.columnPeek,
        center && styles.columnCenter,
      ]}
    >
      {furiganaLine ? (
        // A tight, fixed-height line. The reading is drawn over it, centered,
        // so it never makes the word wider; kana words keep the line blank.
        <View
          style={{
            height: FURIGANA_SIZE[size] * FURIGANA_LINE,
            marginBottom: -fontSizes[size] * FURIGANA_TUCK,
          }}
        >
          {showFurigana ? (
            <Text
              numberOfLines={1}
              style={[
                styles.furigana,
                {
                  fontSize: FURIGANA_SIZE[size],
                  lineHeight: FURIGANA_SIZE[size] * FURIGANA_LINE,
                },
                toneStyles[tone],
              ]}
            >
              {reading}
            </Text>
          ) : null}
        </View>
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
            <View>
              {[text, reading, romaji]
                .filter((line, i, all) => line && all.indexOf(line) === i)
                .map(line => (
                  <Text key={line} style={styles.peekReading}>
                    {line}
                  </Text>
                ))}
            </View>
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
    position: 'absolute',
    top: 0,
    left: -FURIGANA_OVERHANG,
    right: -FURIGANA_OVERHANG,
    textAlign: 'center',
    includeFontPadding: false,
  },
  columnCenter: {
    alignSelf: 'center',
  },
  textCenter: {
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
    borderRadius: radii.button,
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
