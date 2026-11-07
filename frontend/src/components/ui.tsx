// Small shared building blocks: buttons, chips, cards, toggles, headers.
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
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
import { Jp } from './Jp';

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'light' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
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
      <Text style={[styles.buttonText, buttonTextStyles[variant]]}>{label}</Text>
    </Pressable>
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
  glyph,
  label,
  onPress,
  dark = false,
}: {
  glyph: string;
  label: string;
  onPress?: () => void;
  dark?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.iconButton, dark && styles.iconButtonDark]}
    >
      <Text style={[styles.iconGlyph, dark && styles.iconGlyphDark]}>{glyph}</Text>
    </Pressable>
  );
}

// ---------- Chip ----------

type ChipTone = 'default' | 'accent' | 'place' | 'star' | 'outline';

export function Chip({
  label,
  jp,
  tone = 'default',
  selected = false,
  dashed = false,
  icon,
  onPress,
}: {
  label?: string;
  jp?: JpText;
  tone?: ChipTone;
  selected?: boolean;
  dashed?: boolean;
  icon?: string;
  onPress?: () => void;
}): React.JSX.Element {
  const content = (
    <>
      {icon ? <Text style={styles.chipText}>{icon}</Text> : null}
      {jp ? <Jp {...jp} size="sm" /> : null}
      {label ? (
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
          {label}
        </Text>
      ) : null}
    </>
  );
  const chipStyle = [
    base.chip,
    chipStyles[tone],
    selected && styles.chipSelected,
    dashed && styles.chipDashed,
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
  star: { backgroundColor: colors.surface, borderWidth: sizes.hairline, borderColor: colors.star },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
  },
});

// ---------- Card ----------

type CardVariant = 'default' | 'accent' | 'dark' | 'soft';

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
  accent: { backgroundColor: colors.accent, borderColor: colors.accent },
  dark: { backgroundColor: colors.dark, borderColor: colors.dark },
  soft: { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
});

// ---------- Segmented control ----------

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
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
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
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

export function StrengthBar({ strength }: { strength: Strength }): React.JSX.Element {
  return (
    <View
      style={base.row}
      accessibilityLabel={`Strength ${strength} of 4`}
      accessibilityRole="progressbar"
    >
      {[1, 2, 3, 4].map(step => (
        <View
          key={step}
          style={[styles.segmentBar, step <= strength && styles.segmentBarFilled]}
        />
      ))}
      <Text style={[styles.star, strength === 4 && styles.starOn]}>★</Text>
    </View>
  );
}

export function strengthLabel(strength: Strength): string {
  return ['New', 'Warming up', 'Warming up', 'Almost there', 'Star'][strength];
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

export function Loadable<T>({
  state,
  children,
}: {
  state: AsyncState<T>;
  children: (data: T) => React.ReactNode;
}): React.JSX.Element {
  if (state.error) {
    return (
      <View style={[base.card, styles.center]}>
        <Text style={base.heading}>Couldn't load this</Text>
        <Text style={base.caption}>{state.error.message}</Text>
        <Button label="Try again" variant="secondary" onPress={state.reload} />
      </View>
    );
  }
  if (state.data === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <>{children(state.data)}</>;
}

const styles = StyleSheet.create({
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
  iconGlyph: {
    ...base.text,
    fontSize: fontSizes.lg,
  },
  iconGlyphDark: {
    color: colors.textInverse,
  },
  chipText: {
    ...base.text,
    fontSize: fontSizes.sm,
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
    backgroundColor: colors.star,
  },
  star: {
    fontSize: fontSizes.lg,
    color: colors.border,
  },
  starOn: {
    color: colors.star,
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
  },
});
