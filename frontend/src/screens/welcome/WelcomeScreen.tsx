import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { updateProfile } from '../../api/user';
import { MapPlaceholder, Screen } from '../../components/layout';
import { Button } from '../../components/ui';
import {
  settingsForReadingLevel,
  useSettings,
} from '../../state/SettingsContext';
import { base } from '../../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../../styles/tokens';
import type { ReadingLevel } from '../../types';

const LEVELS: { value: ReadingLevel; title: string; help: string }[] = [
  {
    value: 'none',
    title: 'Not yet',
    help: 'Romaji and English help everywhere',
  },
  {
    value: 'kana',
    title: 'Hiragana and katakana',
    help: 'Furigana on every kanji',
  },
  {
    value: 'some_kanji',
    title: 'Some everyday kanji',
    help: 'Furigana only on new kanji',
  },
  {
    value: 'most',
    title: 'Most signs and menus',
    help: 'Japanese first, help on request',
  },
];

const PRIVACY = [
  {
    glyph: '🔒',
    title: 'Only you see your pins',
    body: 'No profile, no followers, nothing public.',
  },
  {
    glyph: '⊖',
    title: 'Home stays blank',
    body: "Pins near where you live are never placed. You pick the area once; we don't guess it.",
  },
  {
    glyph: '👥',
    title: 'Tips you share are anonymous',
    body: 'Only the tip and the shop. No name, no account, no exact time.',
  },
];

export function WelcomeScreen(): React.JSX.Element {
  const { settings, update } = useSettings();
  const [step, setStep] = useState<0 | 1>(0);

  const finish = (locationAllowed: boolean) => {
    // No real location permission in this pass; we only record the choice.
    update({ locationAllowed, onboarded: true, dayOne: true });
    // Best effort: the app works offline/signed out; the level is also kept locally.
    updateProfile({ readingLevel: settings.readingLevel }).catch(() => {});
  };

  return (
    <Screen
      footer={
        step === 0 ? (
          <Button label="Continue" onPress={() => setStep(1)} />
        ) : (
          <>
            <Button
              label="Allow location while using the app"
              onPress={() => finish(true)}
            />
            <Button
              label="Not now, use the camera without places"
              variant="ghost"
              onPress={() => finish(false)}
            />
          </>
        )
      }
    >
      <View style={base.row}>
        {[0, 1].map(i => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      {step === 0 ? (
        <>
          <Text style={base.title}>What can you read so far?</Text>
          <Text style={base.caption}>
            Just a starting point. Tankengo adjusts as you catch and review, so
            there's no wrong answer.
          </Text>
          {LEVELS.map(level => {
            const selected = settings.readingLevel === level.value;
            return (
              <Pressable
                key={level.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => update(settingsForReadingLevel(level.value))}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={styles.optionTitle}>{level.title}</Text>
                <Text style={base.caption}>{level.help}</Text>
              </Pressable>
            );
          })}
          <Text style={base.caption}>
            Explanations in {settings.explanationsLanguage} · change it later in
            Me
          </Text>
        </>
      ) : (
        <>
          <MapPlaceholder height={sizes.mapHeight / 2} />
          <Text style={base.title}>Your map stays yours</Text>
          <Text style={base.caption}>
            Location lets each Tango remember where you found it. Here's what
            that means.
          </Text>
          {PRIVACY.map(item => (
            <View key={item.title} style={styles.privacyRow}>
              <View style={styles.privacyIcon}>
                <Text style={styles.privacyGlyph}>{item.glyph}</Text>
              </View>
              <View style={base.grow}>
                <Text style={styles.optionTitle}>{item.title}</Text>
                <Text style={base.caption}>{item.body}</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: space.sm,
    height: space.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: space.xl,
    backgroundColor: colors.accent,
  },
  option: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.xxs,
  },
  optionSelected: {
    borderWidth: sizes.border,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionTitle: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  privacyRow: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
  },
  privacyIcon: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyGlyph: {
    fontSize: fontSizes.lg,
  },
});
