import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { checkBackendHealth } from '../../api/health';
import { getProfile } from '../../api/user';
import { Jp } from '../../components/Jp';
import { Screen } from '../../components/layout';
import {
  Button,
  Card,
  Loadable,
  SectionTitle,
  SegmentedControl,
  ToggleRow,
} from '../../components/ui';
import { API_BASE_URL, USE_MOCKS } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import { useSettings } from '../../state/SettingsContext';
import { base } from '../../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../../styles/tokens';

const LANGUAGES = [
  { value: 'English', native: 'English' },
  { value: 'Traditional Chinese', native: '中文（繁體）' },
  { value: 'Simplified Chinese', native: '中文（简体）' },
  { value: 'Korean', native: '한국어' },
  { value: 'Vietnamese', native: 'Tiếng Việt' },
  { value: 'Nepali', native: 'नेपाली' },
  { value: 'Spanish', native: 'Español' },
];

const PREVIEW = {
  text: '食券',
  reading: 'しょっけん',
  romaji: 'shokken',
  meaning: 'meal ticket',
};

export function MeScreen(): React.JSX.Element {
  const { settings, update } = useSettings();
  const profile = useAsync(getProfile);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const [health, setHealth] = useState<string>('Not checked');

  const ping = async () => {
    setHealth('Checking…');
    try {
      const res = await checkBackendHealth();
      setHealth(`Online (${res.status})`);
    } catch (err) {
      setHealth(`Unreachable (${err instanceof Error ? err.message : 'error'})`);
    }
  };

  return (
    <Screen edges={['top']}>
      <SectionTitle en="Me" size="title" />
      <Loadable state={profile}>
        {p => (
          <View style={base.stackSm}>
            <Card>
              <View style={base.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.name.charAt(0)}</Text>
                </View>
                <View style={base.grow}>
                  <Text style={base.heading}>{p.name}</Text>
                  <Text style={base.caption}>{p.levelNote}</Text>
                </View>
              </View>
            </Card>
            <View style={base.row}>
              <Stat value={String(p.stats.tango)} label="Tango" />
              <Stat value={`★ ${p.stats.stars}`} label="stars" />
              <Stat value={String(p.stats.places)} label="places" />
            </View>
          </View>
        )}
      </Loadable>

      <Text style={base.heading}>Display and learning</Text>

      <Card>
        <Text style={base.label}>Reading</Text>
        <Text style={styles.rowLabel}>Show Japanese as</Text>
        <SegmentedControl
          options={[
            { value: 'kanji', label: 'Kanji' },
            { value: 'hiragana', label: 'Hiragana' },
            { value: 'romaji', label: 'Romaji' },
          ]}
          value={settings.showJapaneseAs}
          onChange={value => update({ showJapaneseAs: value })}
        />
        <ToggleRow
          label="Furigana over kanji"
          description="Small readings above each kanji"
          value={settings.furigana}
          onValueChange={value => update({ furigana: value })}
        />
        <View style={styles.preview}>
          <Text style={base.label}>Preview</Text>
          <Jp {...PREVIEW} size="xl" bold />
          <Text style={base.caption}>
            Signs and menus you capture always show the real kanji too, so you
            learn to recognize them where you'll actually see them.
          </Text>
        </View>
      </Card>

      <Card>
        <Text style={base.label}>Japanese in the app</Text>
        <Text style={styles.rowLabel}>How much of the app is in Japanese</Text>
        <SegmentedControl
          options={[
            { value: 'little', label: 'A little' },
            { value: 'some', label: 'Some' },
            { value: 'lot', label: 'A lot' },
          ]}
          value={settings.appJapanese}
          onChange={value => update({ appJapanese: value })}
        />
        <Text style={base.caption}>
          Headers and greetings switch to Japanese with dotted underlines. Hold
          any of them to see English. Buttons stay in English.
        </Text>
        <ToggleRow
          label="English after each role-play line"
          description="Turn off for a harder rehearsal"
          value={settings.englishAfterRoleplayLine}
          onValueChange={value => update({ englishAfterRoleplayLine: value })}
        />
      </Card>

      <Card>
        <Text style={base.label}>Practice</Text>
        <View style={base.rowBetween}>
          <Text style={styles.rowLabel}>Staff speaking speed</Text>
          <View style={styles.compact}>
            <SegmentedControl
              options={[
                { value: 'slower', label: 'Slower' },
                { value: 'natural', label: 'Natural' },
              ]}
              value={settings.staffSpeed}
              onChange={value => update({ staffSpeed: value })}
            />
          </View>
        </View>
        <View style={base.rowBetween}>
          <Text style={styles.rowLabel}>Phrases shown first</Text>
          <View style={styles.compact}>
            <SegmentedControl
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'keigo', label: 'Keigo' },
              ]}
              value={settings.phrasesFirst}
              onChange={value => update({ phrasesFirst: value })}
            />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setLanguagesOpen(open => !open)}
          style={base.rowBetween}
        >
          <View style={base.grow}>
            <Text style={styles.rowLabel}>Explanations in</Text>
            <Text style={base.caption}>Meanings, hints and feedback</Text>
          </View>
          <Text style={base.text}>
            {settings.explanationsLanguage} {languagesOpen ? '⌃' : '›'}
          </Text>
        </Pressable>
        {languagesOpen ? (
          <View style={base.stackSm}>
            {LANGUAGES.map(lang => (
              <Pressable
                key={lang.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.explanationsLanguage === lang.value }}
                onPress={() => update({ explanationsLanguage: lang.value })}
                style={[base.rowBetween, styles.language]}
              >
                <View>
                  <Text style={styles.rowLabel}>{lang.native}</Text>
                  <Text style={base.caption}>{lang.value}</Text>
                </View>
                {settings.explanationsLanguage === lang.value ? (
                  <Text style={styles.check}>✓</Text>
                ) : null}
              </Pressable>
            ))}
            <Text style={styles.note}>
              ✦ Explanations are written by Gemini in the language you choose, so
              new languages need no extra content. (Not wired up in this pass.)
            </Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={base.label}>Developer</Text>
        <Text style={base.caption}>
          Data: {USE_MOCKS ? 'mock data (USE_MOCKS)' : 'backend'} · {API_BASE_URL}
        </Text>
        <Text style={base.caption}>Backend health: {health}</Text>
        <Button label="Check backend health" variant="secondary" onPress={ping} />
        <Button
          label="Restart onboarding"
          variant="ghost"
          onPress={() => update({ onboarded: false, dayOne: false })}
        />
      </Card>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <View style={[base.card, styles.stat]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={base.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: sizes.shutter,
    height: sizes.shutter,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...base.text,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...base.heading,
    fontSize: fontSizes.xl,
  },
  rowLabel: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  preview: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: space.md,
    gap: space.sm,
  },
  compact: {
    minWidth: sizes.mapHeight * 0.75,
  },
  language: {
    paddingVertical: space.xs,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  check: {
    ...base.heading,
    color: colors.accent,
  },
  note: {
    ...base.caption,
    color: colors.accent,
  },
});
