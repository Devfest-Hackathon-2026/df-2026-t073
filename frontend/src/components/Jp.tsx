import React, { useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Modal,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  playWord,
  SAVE_ICON,
  SAVE_LABEL,
  useSaveWord,
} from '../features/tango/saveWord';
import { Icon } from './Icon';
import { alignReading, groupUnits, type RubyUnit } from './furigana';
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
  /** Show furigana even when the setting is off, e.g. on a revealed answer. */
  alwaysFurigana?: boolean;
  /**
   * Keep an empty furigana line over words without furigana, so they line
   * up with words that have it. Off inside pills, which center their word.
   */
  keepFuriganaLine?: boolean;
  /** Keep to one line and cut off with … when too long, e.g. in lists. */
  oneLine?: boolean;
  /** Step down up to three sizes when the word is too wide for one line. */
  shrink?: boolean;
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
/**
 * How many furigana characters a reading may stick out over the kana next
 * to it, on each side, before its kanji gets extra space around it.
 */
const FURIGANA_OVERHANG = 1.5;
/** Room around a reading so it is never cut off; it's centered, so this doesn't show. */
const FURIGANA_SPILL = 200;
const SIZES: Size[] = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'jumbo'];
/** How many sizes `shrink` may step down. */
const SHRINK_STEPS = 3;
/** Share of the width `shrink` aims to fill; furigana adds a little width. */
const SHRINK_FILL = 0.9;
const ELLIPSIS = '…';
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
  size: fullSize = 'md',
  bold = false,
  tone = 'default',
  alwaysKanji = false,
  center = false,
  furigana = true,
  alwaysFurigana = false,
  keepFuriganaLine = true,
  oneLine = false,
  shrink = false,
}: JpProps): React.JSX.Element {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const saver = useSaveWord({ text, reading, meaning });
  // Width the word may take, measured when it should shrink to fit.
  const [room, setRoom] = useState(0);
  // One line with furigana: where each piece ends, and the row's width.
  const pieceEnds = useRef<{ key: string; ends: number[] }>({
    key: '',
    ends: [],
  });
  const [rowWidth, setRowWidth] = useState(0);
  const [, setMeasured] = useState(0);

  const mode = alwaysKanji ? 'kanji' : settings.showJapaneseAs;
  let shown = text;
  if (mode === 'romaji' && romaji) {
    shown = romaji;
  } else if (mode === 'hiragana' && reading) {
    shown = reading;
  }
  // With furigana on, every word keeps the furigana line (blank when there
  // is nothing to show), so words with and without it line up.
  const furiganaOn =
    furigana && (alwaysFurigana || settings.furigana) && mode === 'kanji';
  const showFurigana =
    furiganaOn && !!reading && reading !== text && KANJI.test(text);
  const furiganaLine = showFurigana || (furiganaOn && keepFuriganaLine);

  let size = fullSize;
  if (shrink && room > 0) {
    const smallest = Math.max(0, SIZES.indexOf(fullSize) - SHRINK_STEPS);
    for (let i = SIZES.indexOf(fullSize); i >= smallest; i--) {
      size = SIZES[i];
      if (textWidth(shown, size) <= room * SHRINK_FILL) {
        break;
      }
    }
  }

  const textStyle = [
    styles.text,
    sizeStyles[size],
    bold && styles.bold,
    toneStyles[tone],
    center && styles.textCenter,
  ];

  const lineStyle = {
    height: FURIGANA_SIZE[size] * FURIGANA_LINE,
    marginBottom: -fontSizes[size] * FURIGANA_TUCK,
  };
  const furiganaStyle = [
    styles.furigana,
    {
      fontSize: FURIGANA_SIZE[size],
      lineHeight: FURIGANA_SIZE[size] * FURIGANA_LINE,
    },
    toneStyles[tone],
  ];
  // Each kanji group gets its own reading right above it, and the text
  // wraps between pieces like normal text. The reading sits in padding
  // above its piece, so pieces line up on their text baseline (Android
  // places Latin like 53mg/L differently from kanji inside a line).
  const pieceTop = {
    paddingTop: lineStyle.height + lineStyle.marginBottom,
  };
  const units = showFurigana ? alignReading(text, reading!) : null;
  // New word or size: measure the pieces again.
  const pieceKey = `${text}|${reading}|${size}|${showFurigana}`;
  if (pieceEnds.current.key !== pieceKey) {
    pieceEnds.current = { key: pieceKey, ends: [] };
  }
  const groups = units ? groupUnits(units) : null;

  const renderUnit = (
    unit: RubyUnit,
    key: number,
    onLayout?: (e: LayoutChangeEvent) => void,
    hidden?: boolean,
  ) => {
    const fit = rubyFit(units!, unit, size);
    return (
      <View
        key={key}
        onLayout={onLayout}
        style={[
          styles.rubyUnit,
          pieceTop,
          { minWidth: fit.minWidth },
          fit.align && !center && { alignItems: fit.align },
          hidden && styles.hidden,
        ]}
      >
        <View style={[{ height: lineStyle.height }, styles.rubyLine]}>
          {unit.ruby ? (
            <Text
              numberOfLines={1}
              style={[
                furiganaStyle,
                styles.rubyText,
                { transform: [{ translateX: fit.shift }] },
              ]}
            >
              {unit.ruby}
            </Text>
          ) : null}
        </View>
        <Text style={textStyle}>{unit.base}</Text>
      </View>
    );
  };

  let content: React.ReactNode;
  if (units && oneLine) {
    // All pieces stay laid out (so the width doesn't jump); the ones past
    // the edge are hidden and … goes after the last one that fits.
    const { ends } = pieceEnds.current;
    const measured = ends.filter(end => end !== undefined).length;
    const ellipsisWidth = fontSizes[size] * PixelRatio.getFontScale();
    let visible = units.length;
    if (
      rowWidth > 0 &&
      measured === units.length &&
      ends[units.length - 1] > rowWidth + 1
    ) {
      visible = 0;
      while (
        visible < units.length &&
        ends[visible] + ellipsisWidth <= rowWidth
      ) {
        visible++;
      }
    }
    const ellipsisLeft = visible ? ends[visible - 1] : 0;
    content = (
      <View
        style={[styles.rubyRow, styles.rubyRowOneLine]}
        onLayout={e => setRowWidth(e.nativeEvent.layout.width)}
      >
        {units.map((unit, i) =>
          renderUnit(
            unit,
            i,
            e => {
              const { x, width } = e.nativeEvent.layout;
              const known = ends[i] !== undefined;
              ends[i] = x + width;
              if (!known) {
                setMeasured(n => n + 1);
              }
            },
            i >= visible,
          ),
        )}
        {visible < units.length ? (
          <View style={[styles.ellipsis, pieceTop, { left: ellipsisLeft }]}>
            <Text style={textStyle}>{ELLIPSIS}</Text>
          </View>
        ) : null}
      </View>
    );
  } else if (groups) {
    content = (
      <View style={[styles.rubyRow, center && styles.rubyRowCenter]}>
        {groups.map((group, i) => (
          <View key={i} style={styles.rubyGroup}>
            {group.map((unit, j) => renderUnit(unit, j))}
          </View>
        ))}
      </View>
    );
  } else if (showFurigana) {
    // The reading didn't line up with the text: show it whole above,
    // wrapping like the text does.
    content = (
      <>
        <Text
          numberOfLines={oneLine ? 1 : undefined}
          style={[furiganaStyle, center && styles.textCenter]}
        >
          {reading}
        </Text>
        <Text numberOfLines={oneLine ? 1 : undefined} style={textStyle}>
          {shown}
        </Text>
      </>
    );
  } else {
    content = (
      <>
        {furiganaLine ? <View style={lineStyle} /> : null}
        <Text numberOfLines={oneLine ? 1 : undefined} style={textStyle}>
          {shown}
        </Text>
      </>
    );
  }

  const body = (
    <View
      style={[
        styles.column,
        peek && styles.columnPeek,
        center && styles.columnCenter,
      ]}
    >
      {content}
      {peek ? (
        <View style={styles.dots}>
          {DOTS.map(i => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
      ) : null}
    </View>
  );

  // Measures the width the word may take, to pick a size that fits.
  const sized = shrink ? (
    <View
      style={styles.measure}
      onLayout={e => setRoom(e.nativeEvent.layout.width)}
    >
      {body}
    </View>
  ) : (
    body
  );

  if (!peek) {
    return sized;
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        onLongPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityHint={copy.jp.peekHint}
      >
        {sized}
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.scrim}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={copy.common.close}
        >
          {/* Taps inside the card don't close it. */}
          <Pressable style={styles.peek} onPress={() => {}}>
            <View style={base.rowBetween}>
              <Text style={styles.peekMeaning}>
                {meaning ?? copy.jp.noMeaning}
              </Text>
              <Pressable
                style={styles.audio}
                onPress={() => playWord(text)}
                accessibilityRole="button"
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

/**
 * Fits a reading wider than its kanji (kana and kanji are about one font
 * size wide, times the phone's font scale). The reading may stick out over
 * the text on either side, by up to one furigana character, but never past
 * the start or end of the text; what's left widens the kanji. `shift` moves
 * the reading toward the side it sticks out on.
 */
function rubyFit(
  units: RubyUnit[],
  unit: RubyUnit,
  size: Size,
): { minWidth: number; shift: number; align?: 'flex-start' | 'flex-end' } {
  if (!unit.ruby) {
    return { minWidth: 0, shift: 0 };
  }
  const scale = PixelRatio.getFontScale();
  const rubyWidth = [...unit.ruby].length * FURIGANA_SIZE[size] * scale;
  const baseWidth = [...unit.base].length * fontSizes[size] * scale;
  const excess = rubyWidth - baseWidth;
  if (excess <= 0) {
    return { minWidth: 0, shift: 0 };
  }
  const i = units.indexOf(unit);
  const room = FURIGANA_SIZE[size] * scale * FURIGANA_OVERHANG;
  const roomLeft = units[i - 1] && !units[i - 1].ruby ? room : 0;
  const roomRight = units[i + 1] && !units[i + 1].ruby ? room : 0;
  // Split the overhang evenly, then give any leftover to the roomier side.
  let left = Math.min(roomLeft, excess / 2);
  let right = Math.min(roomRight, excess / 2);
  left = Math.min(roomLeft, excess - right);
  right = Math.min(roomRight, excess - left);
  // At the very start or end, the kanji stays flush with the text's edge.
  const align =
    i === 0 ? 'flex-start' : i === units.length - 1 ? 'flex-end' : undefined;
  return {
    minWidth: rubyWidth - left - right,
    shift: (right - left) / 2,
    align,
  };
}

/** Rough width of text on one line: full-width characters are one font size wide, others about half. */
function textWidth(text: string, size: Size): number {
  let ems = 0;
  for (const ch of text) {
    ems += ch.charCodeAt(0) < 0x2000 ? 0.6 : 1;
  }
  return ems * fontSizes[size] * PixelRatio.getFontScale();
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
    textAlign: 'center',
    includeFontPadding: false,
  },
  rubyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  rubyRowOneLine: {
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  hidden: {
    opacity: 0,
  },
  ellipsis: {
    position: 'absolute',
    top: 0,
  },
  measure: {
    alignSelf: 'stretch',
  },
  rubyRowCenter: {
    justifyContent: 'center',
  },
  rubyGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  // As wide as the wider of the kanji and its reading, both centered.
  rubyUnit: {
    alignItems: 'center',
  },
  // Out of the flow, so the piece's baseline is its text's baseline.
  rubyLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // Drawn over the line, centered, so it is never cut off.
  rubyText: {
    position: 'absolute',
    top: 0,
    left: -FURIGANA_SPILL,
    right: -FURIGANA_SPILL,
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
