import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { checkBackendAuth, checkBackendHealth } from '../../api/health';
import { searchPlaces } from '../../api/places';
import { getProfile, updateProfile } from '../../api/user';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import {
  Button,
  Card,
  Loadable,
  SegmentedControl,
  ToggleRow,
} from '../../components/ui';
import {
  API_BASE_URL,
  LIVE_APIS,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  USE_MOCKS,
} from '../../config';
import { useAsync } from '../../hooks/useAsync';
import { type AuthStatus, useAuth } from '../../state/AuthContext';
import {
  settingsForReadingLevel,
  useSettings,
} from '../../state/SettingsContext';
import { base } from '../../styles/base';
import { colors, fontWeights, radii, sizes, space } from '../../styles/tokens';
import type { HomeArea, Place } from '../../types';
import { READING_LEVELS } from '../welcome/WelcomeScreen';
import { copy } from '../../copy';

export const LANGUAGES = [
  { value: 'English', native: 'English' },
  { value: 'Traditional Chinese', native: '中文（繁體）' },
  { value: 'Simplified Chinese', native: '中文（简体）' },
  { value: 'Korean', native: '한국어' },
  { value: 'Vietnamese', native: 'Tiếng Việt' },
  { value: 'Nepali', native: 'नेपाली' },
  { value: 'Spanish', native: 'Español' },
];

const AUTH_LABEL: Record<AuthStatus, string> = {
  not_configured: 'off (Firebase values not set in .env)',
  signing_in: 'signing in…',
  signed_in: 'signed in',
  signed_out: 'signed out',
  error: 'failed',
};

const PREVIEW = copy.settings.preview;

const HOME_RADIUS_M = 500;

// ---------- Profile: name, reading level, home area ----------

export function ProfileSection(): React.JSX.Element {
  const { settings, update } = useSettings();
  const auth = useAuth();
  const profile = useAsync(getProfile);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveName = async (current: string) => {
    const trimmed = (name ?? current).trim();
    if (!trimmed || trimmed === current) {
      setName(null);
      return;
    }
    try {
      await updateProfile({ name: trimmed });
      setName(null);
      setError(null);
      profile.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.settings.couldNotSave);
    }
  };

  return (
    <Loadable state={profile}>
      {p => (
        <View style={base.stack}>
          <Card>
            <Text style={base.label}>{copy.settings.name}</Text>
            <TextInput
              value={name ?? p.name}
              onChangeText={setName}
              onEndEditing={() => saveName(p.name)}
              onSubmitEditing={() => saveName(p.name)}
              maxLength={40}
              returnKeyType="done"
              style={styles.input}
              accessibilityLabel={copy.settings.nameA11y}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Card>

          <Card>
            <Text style={base.label}>{copy.settings.readingLevel}</Text>
            {READING_LEVELS.map(level => {
              const selected = settings.readingLevel === level.value;
              return (
                <Pressable
                  key={level.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    update(settingsForReadingLevel(level.value));
                    updateProfile({ readingLevel: level.value }).catch(
                      () => {},
                    );
                  }}
                  style={styles.option}
                >
                  <View style={base.grow}>
                    <Text style={styles.rowLabel}>{level.title}</Text>
                    <Text style={base.caption}>{level.help}</Text>
                  </View>
                  {selected ? <Icon name="done" color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </Card>

          <HomeAreaCard current={p.homeArea ?? null} onSaved={profile.reload} />

          {auth.user ? (
            <Card>
              <Text style={base.label}>{copy.settings.account}</Text>
              <Text style={base.caption}>
                {auth.user.email
                  ? copy.settings.signedInAs(auth.user.email)
                  : auth.user.isAnonymous
                  ? copy.settings.signedInGuest
                  : copy.settings.signedIn}
              </Text>
              <Text style={base.caption}>{copy.settings.uid(auth.user.uid)}</Text>
              <Button
                label={copy.settings.logOut}
                variant="ghost"
                onPress={() => {
                  auth.signOut().catch(() => {});
                }}
              />
            </Card>
          ) : null}
        </View>
      )}
    </Loadable>
  );
}

/** Pins within 500 m of home are never shown on the map. */
function HomeAreaCard({
  current,
  onSaved,
}: {
  current: HomeArea | null;
  onSaved: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useAsync(
    () =>
      query.trim().length >= 2 ? searchPlaces(query) : Promise.resolve([]),
    query,
  );
  const [error, setError] = useState<string | null>(null);

  const choose = async (place: Place) => {
    setError(null);
    try {
      await updateProfile({
        homeArea: {
          label: place.name.meaning || place.name.text,
          lat: place.lat,
          lng: place.lng,
          radiusM: HOME_RADIUS_M,
        },
      });
      setOpen(false);
      setQuery('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.settings.couldNotSave);
    }
  };

  return (
    <Card>
      <View style={base.rowBetween}>
        <View style={base.grow}>
          <Text style={base.label}>{copy.settings.homeArea}</Text>
          <Text style={styles.rowLabel}>
            {current ? current.label : copy.settings.notSet}
          </Text>
          {current ? (
            <Text style={base.caption}>
              {copy.settings.homeRadius(current.radiusM)}
            </Text>
          ) : null}
        </View>
        <Button
          label={open ? copy.settings.cancel : current ? copy.settings.change : copy.settings.set}
          variant="secondary"
          onPress={() => setOpen(o => !o)}
        />
      </View>
      {open ? (
        <View style={base.stackSm}>
          <View style={styles.searchBox}>
            <Icon name="search" color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={copy.settings.homeSearchPlaceholder}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoFocus
              accessibilityLabel={copy.settings.homeSearchA11y}
            />
          </View>
          {(results.data ?? []).map(place => (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              onPress={() => choose(place)}
              style={styles.option}
            >
              <View style={base.grow}>
                <Text style={styles.rowLabel}>
                  {place.name.meaning || place.name.text}
                </Text>
                <Text style={base.caption}>
                  {[place.area, place.category].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}

// ---------- Display settings ----------

export function DisplaySection(): React.JSX.Element {
  const { settings, update } = useSettings();
  return (
    <View style={base.stack}>
      <Card>
        <Text style={base.label}>{copy.settings.showJapaneseAs}</Text>
        <SegmentedControl
          options={[
            { value: 'kanji', label: copy.settings.kanji },
            { value: 'hiragana', label: copy.settings.hiragana },
            { value: 'romaji', label: copy.settings.romaji },
          ]}
          value={settings.showJapaneseAs}
          onChange={value => update({ showJapaneseAs: value })}
        />
        <ToggleRow
          label={copy.settings.furigana}
          value={settings.furigana}
          onValueChange={value => update({ furigana: value })}
        />
        <View style={styles.preview}>
          <Jp {...PREVIEW} size="xl" bold />
        </View>
      </Card>
      <Card>
        <Text style={base.label}>{copy.settings.japaneseInApp}</Text>
        <SegmentedControl
          options={[
            { value: 'little', label: copy.settings.aLittle },
            { value: 'some', label: copy.settings.some },
            { value: 'lot', label: copy.settings.aLot },
          ]}
          value={settings.appJapanese}
          onChange={value => update({ appJapanese: value })}
        />
      </Card>
    </View>
  );
}

// ---------- Conversation practice settings ----------

export function PracticeSection(): React.JSX.Element {
  const { settings, update } = useSettings();
  return (
    <Card>
      <Text style={base.label}>{copy.settings.staffSpeed}</Text>
      <SegmentedControl
        options={[
          { value: 'slower', label: copy.settings.slower },
          { value: 'natural', label: copy.settings.natural },
        ]}
        value={settings.staffSpeed}
        onChange={value => update({ staffSpeed: value })}
      />
      <Text style={base.label}>{copy.settings.phrasesFirst}</Text>
      <SegmentedControl
        options={[
          { value: 'easy', label: copy.settings.easy },
          { value: 'keigo', label: copy.settings.keigo },
        ]}
        value={settings.phrasesFirst}
        onChange={value => update({ phrasesFirst: value })}
      />
      <ToggleRow
        label={copy.settings.englishAfterLine}
        value={settings.englishAfterRoleplayLine}
        onValueChange={value => update({ englishAfterRoleplayLine: value })}
      />
    </Card>
  );
}

// ---------- Native language ----------

export function LanguagesSection(): React.JSX.Element {
  const { settings, update } = useSettings();
  return (
    <Card>
      {LANGUAGES.map(lang => {
        const selected = settings.explanationsLanguage === lang.value;
        return (
          <Pressable
            key={lang.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => update({ explanationsLanguage: lang.value })}
            style={styles.option}
          >
            <View style={base.grow}>
              <Text style={styles.rowLabel}>{lang.native}</Text>
              <Text style={base.caption}>{lang.value}</Text>
            </View>
            {selected ? <Icon name="done" color={colors.accent} /> : null}
          </Pressable>
        );
      })}
      <Text style={base.caption}>{copy.settings.languageFooter}</Text>
    </Card>
  );
}

// ---------- Map and location settings ----------

const LOCATION_USES = [
  {
    icon: 'pin' as const,
    text: copy.settings.locationUses.pins,
  },
  {
    icon: 'search' as const,
    text: copy.settings.locationUses.search,
  },
  {
    icon: 'home' as const,
    text: copy.settings.locationUses.home,
  },
  {
    icon: 'people' as const,
    text: copy.settings.locationUses.sharing,
  },
  {
    icon: 'time' as const,
    text: copy.settings.locationUses.foreground,
  },
];

export function PrivacySection(): React.JSX.Element {
  const { settings, update } = useSettings();
  return (
    <View style={base.stack}>
      <Card>
        <ToggleRow
          label={copy.settings.mapAndLocation}
          description={
            settings.mapFeatures ? copy.settings.mapOn : copy.settings.mapOff
          }
          value={settings.mapFeatures}
          onValueChange={value => update({ mapFeatures: value })}
        />
      </Card>
      <Card>
        <Text style={base.heading}>{copy.settings.howLocationIsUsed}</Text>
        {LOCATION_USES.map(use => (
          <View key={use.text} style={styles.use}>
            <Icon name={use.icon} color={colors.accent} />
            <Text style={[base.text, base.grow]}>{use.text}</Text>
          </View>
        ))}
        <Text style={base.caption}>{copy.settings.locationFooter}</Text>
      </Card>
    </View>
  );
}

// ---------- Developer ----------

export function DeveloperSection(): React.JSX.Element {
  const { update } = useSettings();
  const auth = useAuth();
  const [health, setHealth] = useState('Not checked');
  const [backendAuth, setBackendAuth] = useState('Not checked');
  const [testEmail, setTestEmail] = useState(
    TEST_USER_EMAIL || 'test@tankengo.com',
  );
  const [testPassword, setTestPassword] = useState(
    TEST_USER_PASSWORD || 'password123',
  );
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  const ping = async () => {
    setHealth('Checking…');
    try {
      const res = await checkBackendHealth();
      setHealth(`Online (${res.status})`);
    } catch (err) {
      setHealth(
        `Unreachable (${err instanceof Error ? err.message : 'error'})`,
      );
    }
  };

  const checkAuth = async () => {
    setBackendAuth('Checking…');
    try {
      const me = await checkBackendAuth();
      setBackendAuth(`Accepted (uid ${me.uid.slice(0, 8)}…)`);
    } catch (err) {
      setBackendAuth(
        `Rejected (${err instanceof Error ? err.message : 'error'})`,
      );
    }
  };

  const handleTestSignIn = async () => {
    setAuthBusy(true);
    setAuthMsg('Signing in / creating test account…');
    try {
      const u = await auth.signInWithTest(testEmail, testPassword);
      setAuthMsg(`Signed in as ${u?.email} (uid: ${u?.uid.slice(0, 8)}…)`);
    } catch (err) {
      setAuthMsg(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await auth.signOut();
      setAuthMsg('Signed out.');
    } catch (err) {
      setAuthMsg(
        `Sign out error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <View style={base.stack}>
      <Card>
        <Text style={base.label}>Backend Connection</Text>
        <Text style={base.caption}>
          Data:{' '}
          {USE_MOCKS
            ? `mock data${
                LIVE_APIS.size ? `, live: ${[...LIVE_APIS].join(', ')}` : ''
              }`
            : 'backend'}{' '}
          · {API_BASE_URL}
        </Text>
        <Text style={base.caption}>Backend health: {health}</Text>
        <Button
          label="Check backend health"
          variant="secondary"
          onPress={ping}
        />
        <Text style={base.caption}>Backend sign-in check: {backendAuth}</Text>
        <Button
          label="Check sign-in with backend"
          variant="secondary"
          onPress={checkAuth}
        />
      </Card>

      <Card>
        <Text style={base.label}>User Account</Text>
        <Text style={base.caption}>
          Status: {AUTH_LABEL[auth.status]}
          {auth.user?.email
            ? ` · Email: ${auth.user.email}`
            : auth.user?.isAnonymous
            ? ' · (Anonymous user)'
            : ''}
          {auth.user ? ` · UID: ${auth.user.uid.slice(0, 8)}…` : ''}
          {auth.error ? ` · ${auth.error}` : ''}
        </Text>

        <Text style={styles.subLabel}>Test user credentials</Text>
        <TextInput
          value={testEmail}
          onChangeText={setTestEmail}
          placeholder="Test email"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={testPassword}
          onChangeText={setTestPassword}
          placeholder="Test password"
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />

        {authMsg ? <Text style={styles.authNotice}>{authMsg}</Text> : null}

        <Button
          label={authBusy ? 'Please wait…' : 'Sign in as test user'}
          variant="secondary"
          disabled={authBusy}
          onPress={handleTestSignIn}
        />

        {auth.user ? (
          <Button
            label="Sign out"
            variant="ghost"
            disabled={authBusy}
            onPress={handleSignOut}
          />
        ) : null}
      </Card>

      <Card>
        <Button
          label="Restart onboarding"
          variant="ghost"
          onPress={() => update({ onboarded: false, dayOne: false })}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    ...base.heading,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.accent,
    paddingVertical: space.xxs,
  },
  error: {
    ...base.caption,
    color: colors.caution,
  },
  rowLabel: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  preview: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: space.md,
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.pill,
    paddingHorizontal: space.lg,
    minHeight: sizes.touch,
  },
  searchInput: {
    ...base.text,
    flex: 1,
    paddingVertical: 0,
  },
  use: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  subLabel: {
    ...base.label,
    marginTop: space.sm,
    color: colors.textMuted,
  },
  authNotice: {
    ...base.caption,
    color: colors.accent,
    marginVertical: space.xs,
  },
});
