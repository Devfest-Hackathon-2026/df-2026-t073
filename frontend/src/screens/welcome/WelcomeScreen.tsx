import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { updateProfile } from '../../api/user';
import { requestLocationPermission } from '../../location/location';
import { MapPlaceholder, Screen } from '../../components/layout';
import { Button } from '../../components/ui';
import {
  settingsForReadingLevel,
  useSettings,
} from '../../state/SettingsContext';
import { base } from '../../styles/base';
import { colors, fontWeights, radii, sizes, space } from '../../styles/tokens';
import type { ReadingLevel } from '../../types';
import { Icon } from '../../components/Icon';
import { copy } from '../../copy';

export const READING_LEVELS: {
  value: ReadingLevel;
  title: string;
  help: string;
}[] = [
  { value: 'none', ...copy.welcome.readingLevels.none },
  { value: 'kana', ...copy.welcome.readingLevels.kana },
  { value: 'some_kanji', ...copy.welcome.readingLevels.some_kanji },
  { value: 'most', ...copy.welcome.readingLevels.most },
];

const PRIVACY = [
  { icon: 'lock' as const, ...copy.welcome.privacy.pins },
  { icon: 'remove' as const, ...copy.welcome.privacy.home },
  { icon: 'people' as const, ...copy.welcome.privacy.tips },
];

export function WelcomeScreen(): React.JSX.Element {
  const { settings, update } = useSettings();
  const [step, setStep] = useState<0 | 1>(0);

  const finish = async (wantsLocation: boolean) => {
    // Android shows its own permission dialog; the app works either way.
    const locationAllowed = wantsLocation
      ? await requestLocationPermission().catch(() => false)
      : false;
    update({
      locationAllowed,
      onboarded: true,
      dayOne: true,
      rehearsedOnce: false,
    });
    // Best effort: the app works offline/signed out; the level is also kept locally.
    updateProfile({ readingLevel: settings.readingLevel }).catch(() => {});
  };

  return (
    <Screen
      footer={
        step === 0 ? (
          <Button label={copy.welcome.continue} onPress={() => setStep(1)} />
        ) : (
          <>
            <Button
              label={copy.welcome.allowLocation}
              onPress={() => finish(true)}
            />
            <Button
              label={copy.welcome.notNow}
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
          <Text style={base.title}>{copy.welcome.readTitle}</Text>
          <Text style={base.caption}>{copy.welcome.readBody}</Text>
          {READING_LEVELS.map(level => {
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
            {copy.welcome.explanationsIn(settings.explanationsLanguage)}
          </Text>
        </>
      ) : (
        <>
          <MapPlaceholder height={sizes.mapHeight / 2} />
          <Text style={base.title}>{copy.welcome.mapTitle}</Text>
          <Text style={base.caption}>{copy.welcome.mapBody}</Text>
          {PRIVACY.map(item => (
            <View key={item.title} style={styles.privacyRow}>
              <View style={styles.privacyIcon}>
                <Icon name={item.icon} color={colors.accent} />
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
});
