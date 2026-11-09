// Small shared building blocks: buttons, chips, cards, toggles, headers.
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import type { AsyncState } from '../hooks/useAsync';
import { useSettings } from '../state/SettingsContext';
import { base } from '../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  opacity,
  radii,
  sizes,
  space,
} from '../styles/tokens';
import type { AppJapanese, JpText, Strength } from '../types';
import { Hanamaru } from './Hanamaru';
import { HanaSeal } from './shapes';
import { Icon, type IconName } from './Icon';
import { Jp } from './Jp';
import { copy } from '../copy';

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'light' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  icon,
  onColor,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: IconName;
  /**
   * The colored surface a light button sits on (e.g. the ink Up next card).
   * Its text takes that color, so the button reads as cut from the surface.
   */
  onColor?: string;
}): React.JSX.Element {
  const textColor =
    variant === 'light' && onColor ? onColor : buttonTextStyles[variant].color;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        base.button,
        buttonStyles[variant],
        (pressed || disabled) && styles.dimmed,
        style,
      ]}
    >
      <View style={styles.buttonRow}>
        {icon ? (
          <Icon name={icon} size={fontSizes.md} color={textColor} />
        ) : null}
        <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * An icon in front of a line of text, in the text's own color and size
 * (eyebrows like "Gemini suggests", place lines, statuses).
 */
/** A small round number, e.g. how many Tango a collection has. */
export function CountBadge({
  count,
  selected = false,
}: {
  count: number;
  selected?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.countBadge, selected && styles.countBadgeSelected]}>
      <Text style={[styles.countText, selected && styles.countTextSelected]}>
        {count}
      </Text>
    </View>
  );
}

/** One fact in a Facts row; empty values are left out. */
export interface Fact {
  icon: IconName;
  text: string | number | null | undefined;
}

/**
 * Small facts side by side, each with an icon (e.g. date, category, area, Tango count),
 * in the all-caps label style used for small details across the app.
 */
export function Facts({
  items,
  inverse = false,
}: {
  items: Fact[];
  /** Light text, for dark or accent cards. */
  inverse?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.facts}>
      {items
        .filter(
          item =>
            item.text !== null && item.text !== undefined && item.text !== '',
        )
        .map(item => (
          <IconLabel
            key={`${item.icon}-${item.text}`}
            icon={item.icon}
            style={[base.label, inverse && styles.factsInverse]}
          >
            {item.text}
          </IconLabel>
        ))}
    </View>
  );
}

export function IconLabel({
  icon,
  children,
  style,
  numberOfLines,
}: {
  icon: IconName | 'hanamaru';
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}): React.JSX.Element {
  const flat = StyleSheet.flatten([base.text, style]) ?? {};
  const size = (flat.fontSize ?? fontSizes.md) * 1.05;
  return (
    <View style={styles.iconLabel}>
      {icon === 'hanamaru' ? (
        <Hanamaru size={size} />
      ) : (
        <Icon
          name={icon}
          size={size}
          color={(flat.color as string) ?? colors.text}
        />
      )}
      <Text style={[styles.iconLabelText, style]} numberOfLines={numberOfLines}>
        {children}
      </Text>
    </View>
  );
}

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
  },
  dark: { backgroundColor: colors.dark },
  light: { backgroundColor: colors.surface },
  ghost: { backgroundColor: colors.bg },
});

const buttonTextStyles = StyleSheet.create({
  primary: { color: colors.textInverse },
  secondary: { color: colors.text },
  dark: { color: colors.textInverse },
  light: { color: colors.accent },
  ghost: { color: colors.accent },
});

// ---------- Icon button (✕, ‹, etc.) ----------

export function IconButton({
  icon,
  label,
  onPress,
  dark = false,
  filled = false,
  color,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  dark?: boolean;
  /** Solid icon, e.g. a favourited heart. */
  filled?: boolean;
  color?: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.iconButton, dark && styles.iconButtonDark]}
    >
      <Icon
        name={icon}
        filled={filled}
        color={color ?? (dark ? colors.textInverse : colors.text)}
      />
    </Pressable>
  );
}

// ---------- Chip ----------

type ChipTone =
  | 'default'
  | 'accent'
  | 'place'
  | 'hanamaru'
  | 'outline'
  /** Light outline and text, for dark cards. */
  | 'inverse';

export function Chip({
  label,
  jp,
  tone = 'default',
  selected = false,
  dashed = false,
  icon,
  count,
  onPress,
}: {
  label?: string;
  jp?: JpText;
  tone?: ChipTone;
  selected?: boolean;
  dashed?: boolean;
  /** A Lucide icon, or the hanamaru mark for mastered Tango. */
  icon?: IconName | 'hanamaru';
  /** A number shown in a small badge after the label, e.g. a collection's size. */
  count?: number;
  onPress?: () => void;
}): React.JSX.Element {
  const inverse = tone === 'inverse';
  const content = (
    <>
      {icon === 'hanamaru' ? (
        <Hanamaru size={fontSizes.md} />
      ) : icon ? (
        <Icon
          name={icon}
          size={fontSizes.md}
          color={inverse ? colors.textInverse : colors.textMuted}
        />
      ) : null}
      {jp ? (
        // Fills the chip's height so the word sits in the middle.
        <View style={styles.chipJp}>
          <Jp
            {...jp}
            size="sm"
            tone={inverse ? 'inverse' : 'default'}
            keepFuriganaLine={false}
          />
        </View>
      ) : null}
      {label ? (
        <Text
          style={[
            styles.chipText,
            inverse && styles.factsInverse,
            selected && styles.chipTextSelected,
          ]}
        >
          {label}
        </Text>
      ) : null}
      {count !== undefined ? (
        <CountBadge count={count} selected={selected} />
      ) : null}
    </>
  );
  const chipStyle = [
    base.chip,
    chipStyles[tone],
    selected && styles.chipSelected,
    dashed && styles.chipDashed,
    dashed && inverse && chipStyles.inverseDashed,
  ];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={chipStyle}>
        {content}
      </Pressable>
    );
  }
  return <View style={chipStyle}>{content}</View>;
}

const chipStyles = StyleSheet.create({
  default: {},
  accent: { backgroundColor: colors.accentSoft },
  place: { backgroundColor: colors.surfaceMuted },
  hanamaru: {
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.hanamaru,
  },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
  },
  inverse: {
    backgroundColor: colors.inverseSoft,
    borderWidth: sizes.hairline,
    borderColor: colors.inverseBorder,
  },
  inverseDashed: {
    backgroundColor: 'transparent',
    borderColor: colors.inverseBorder,
  },
});

// ---------- Card ----------

type CardVariant = 'default' | 'ink' | 'dark' | 'soft';

export function Card({
  children,
  variant = 'default',
  onPress,
  style,
}: {
  children: React.ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const cardStyle = [base.card, cardStyles[variant], style];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={cardStyle}>
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

const cardStyles = StyleSheet.create({
  default: {},
  ink: { backgroundColor: colors.ink, borderColor: colors.ink },
  dark: { backgroundColor: colors.dark, borderColor: colors.dark },
  soft: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
});

// ---------- Segmented control ----------

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <View style={styles.buttonRow}>
              {option.icon ? (
                <Icon
                  name={option.icon}
                  size={fontSizes.md}
                  color={active ? colors.text : colors.textMuted}
                />
              ) : null}
              <Text
                style={[styles.segmentText, active && styles.segmentTextActive]}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Toggle row ----------

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View style={base.rowBetween}>
      <View style={base.grow}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={base.caption}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

// ---------- Section title (follows "How much of the app is in Japanese") ----------

const LEVEL_RANK: Record<AppJapanese, number> = { little: 0, some: 1, lot: 2 };

/**
 * Shows `jp` instead of `en` once the user's "app in Japanese" level reaches
 * `jpFrom`. Japanese titles keep the dotted underline for lookup.
 */
export function SectionTitle({
  en,
  jp,
  jpFrom = 'lot',
  size = 'heading',
  right,
}: {
  en: string;
  jp?: JpText;
  jpFrom?: AppJapanese;
  size?: 'heading' | 'title';
  right?: React.ReactNode;
}): React.JSX.Element {
  const { settings } = useSettings();
  const useJp = !!jp && LEVEL_RANK[settings.appJapanese] >= LEVEL_RANK[jpFrom];
  return (
    <View style={base.rowBetween}>
      {useJp && jp ? (
        <Jp
          {...jp}
          meaning={jp.meaning ?? en}
          peek
          bold
          size={size === 'title' ? 'xxl' : 'lg'}
        />
      ) : (
        <Text style={size === 'title' ? base.title : base.heading}>{en}</Text>
      )}
      {right}
    </View>
  );
}

// ---------- Strength bar ----------

export function StrengthBar({
  strength,
}: {
  strength: Strength;
}): React.JSX.Element {
  return (
    <View
      style={base.row}
      accessibilityLabel={copy.strength.a11y(strength)}
      accessibilityRole="progressbar"
    >
      {[1, 2, 3, 4].map(step => (
        <View
          key={step}
          style={[
            styles.segmentBar,
            step <= strength && styles.segmentBarFilled,
          ]}
        />
      ))}
      <HanaSeal color={strength === 4 ? colors.hanamaru : colors.border} />
    </View>
  );
}

export function strengthLabel(strength: Strength): string {
  return copy.strength.levels[strength];
}

// ---------- Progress bar ----------

export function ProgressBar({ value }: { value: number }): React.JSX.Element {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.round(Math.min(1, value) * 100)}%` as const },
        ]}
      />
    </View>
  );
}

// ---------- Numbered step ----------

export function NumberedStep({
  index,
  children,
  done = false,
}: {
  index: number;
  children: React.ReactNode;
  done?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.step}>
      <View style={[styles.stepNumber, done && styles.stepNumberDone]}>
        <Text style={styles.stepNumberText}>{index}</Text>
      </View>
      <View style={base.grow}>{children}</View>
    </View>
  );
}

// ---------- Loading / error wrapper ----------

/** Light, upbeat lines shown while something loads. */
export const LOADING_LINES = copy.common.loadingLines;

const LINE_MS = 1600;

/** A spinner with one line at a time, fading through `lines`. */
export function LoadingLines({
  lines = LOADING_LINES,
}: {
  lines?: string[];
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (lines.length < 2) {
      return;
    }
    const timer = setInterval(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setIndex(i => (i + 1) % lines.length);
        Animated.timing(fade, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }, LINE_MS);
    return () => clearInterval(timer);
  }, [lines, fade]);
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Animated.Text style={[styles.loadingLine, { opacity: fade }]}>
        {lines[index % lines.length]}
      </Animated.Text>
    </View>
  );
}

export function Loadable<T>({
  state,
  children,
  messages,
}: {
  state: AsyncState<T>;
  children: (data: T) => React.ReactNode;
  /** Lines to cycle through while loading (defaults to LOADING_LINES). */
  messages?: string[];
}): React.JSX.Element {
  if (state.error) {
    return (
      <View style={[base.card, styles.center]}>
        <Text style={base.heading}>{copy.common.couldNotLoad}</Text>
        <Text style={base.caption}>{state.error.message}</Text>
        <Button
          label={copy.common.tryAgain}
          variant="secondary"
          onPress={state.reload}
        />
      </View>
    );
  }
  if (state.data === undefined) {
    return <LoadingLines lines={messages} />;
  }
  return <>{children(state.data)}</>;
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.md,
    rowGap: space.xxs,
  },
  factsInverse: {
    color: colors.textInverse,
  },
  countBadge: {
    minWidth: space.lg,
    paddingHorizontal: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    alignItems: 'center',
  },
  countBadgeSelected: {
    backgroundColor: colors.accent,
  },
  countText: {
    ...base.caption,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  countTextSelected: {
    color: colors.textInverse,
  },
  iconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
  },
  iconLabelText: {
    flexShrink: 1,
  },
  dimmed: { opacity: opacity.pressed },
  buttonText: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  iconButton: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDark: {
    backgroundColor: colors.overlay,
  },
  chipJp: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    flexShrink: 1,
  },
  chipText: {
    ...base.text,
    fontSize: fontSizes.sm,
    flexShrink: 1,
  },
  chipTextSelected: {
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderWidth: sizes.border,
    borderColor: colors.accent,
  },
  chipDashed: {
    borderWidth: sizes.hairline,
    borderStyle: 'dashed',
    borderColor: colors.textMuted,
    backgroundColor: colors.surface,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    padding: space.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radii.pill,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    ...base.text,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: fontWeights.bold,
  },
  rowLabel: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  segmentBar: {
    flex: 1,
    height: sizes.strengthSegment,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  segmentBarFilled: {
    backgroundColor: colors.hanamaru,
  },
  progressTrack: {
    flex: 1,
    height: sizes.strengthSegment / 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  step: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: sizes.pin,
    height: sizes.pin,
    borderRadius: radii.pill,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberDone: {
    backgroundColor: colors.positive,
  },
  stepNumberText: {
    ...base.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textInverse,
  },
  center: {
    alignItems: 'center',
  },
  loading: {
    padding: space.xxl,
    alignItems: 'center',
    gap: space.md,
  },
  loadingLine: {
    ...base.caption,
    textAlign: 'center',
  },
});
