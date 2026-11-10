import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { getProfile } from '../../api/user';
import { Hanamaru } from '../../components/Hanamaru';
import { Icon, type IconName } from '../../components/Icon';
import { Screen } from '../../components/layout';
import { Button, Card, Loadable, SectionTitle } from '../../components/ui';
import { useCachedAsync } from '../../hooks/useCachedAsync';
import { useReloadOnFocus } from '../../hooks/useReloadOnFocus';
import { type MeSectionId, useRootNav } from '../../navigation/types';
import { useAuth } from '../../state/AuthContext';
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
import { copy } from '../../copy';

const LINES = copy.me.loadingLines;
/** The profile section takes about this share of the screen's height. */
const PROFILE_SHARE = 0.4;
const AVATAR_SIZE = 96;


/** Me: who you are and how you're doing at a glance; settings one tap away. */
export function MeScreen(): React.JSX.Element {
  const nav = useRootNav();
  const { height } = useWindowDimensions();
  const { settings } = useSettings();
  const auth = useAuth();
  const profile = useCachedAsync('user:profile', getProfile, '', {
    ttlMs: 30 * 60 * 1000,
  });
  useReloadOnFocus(profile.revalidate);

  const [pullRefreshing, setPullRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await profile.reload();
    } finally {
      setPullRefreshing(false);
    }
  }, [profile]);

  const sections: {
    id: MeSectionId;
    icon: IconName;
    title: string;
    value?: string;
  }[] = [
    { id: 'display', icon: 'display', title: copy.meSections.display },
    { id: 'practice', icon: 'learn', title: copy.meSections.practice },
    {
      id: 'languages',
      icon: 'translate',
      title: copy.meSections.languages,
      value: settings.explanationsLanguage,
    },
    {
      id: 'privacy',
      icon: 'privacy',
      title: copy.meSections.privacy,
      value: settings.mapFeatures ? copy.me.mapOn : copy.me.mapOff,
    },
  ];

  return (
    <Screen
      edges={['top']}
      refreshControl={
        <RefreshControl
          refreshing={pullRefreshing}
          onRefresh={onRefresh}
          colors={[colors.accent]}
          tintColor={colors.accent}
        />
      }
    >
      <SectionTitle en={copy.me.title} size="title" />
      <Loadable state={profile} messages={LINES}>
        {p => (
          <View style={[styles.profile, { minHeight: height * PROFILE_SHARE }]}>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.name.charAt(0)}</Text>
              </View>
              <Text style={base.title} numberOfLines={1}>
                {p.name}
              </Text>
              {/* Same description as the level picker. */}
              <Text style={base.caption} numberOfLines={1}>
                {copy.welcome.readingLevels[settings.readingLevel].help}
              </Text>
              <Button
                label={copy.me.editProfile}
                icon="edit"
                variant="secondary"
                onPress={() =>
                  nav.navigate('MeSection', { section: 'profile' })
                }
              />
            </View>
            <View style={styles.stats}>
              <Stat value={p.stats.tango} label={copy.me.statTango} />
              <Stat
                value={p.stats.stars}
                label={copy.me.statStamps}
                mark={<Hanamaru size={fontSizes.md} />}
              />
              <Stat value={p.stats.places} label={copy.me.statPlaces} />
            </View>
          </View>
        )}
      </Loadable>

      <Card>
        {sections.map((s, i) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => nav.navigate('MeSection', { section: s.id })}
            style={[styles.row, i > 0 && styles.rowDivider]}
          >
            <Icon name={s.icon} color={colors.accent} />
            <Text style={[styles.rowLabel, base.grow]}>{s.title}</Text>
            {s.value ? (
              <Text style={base.caption} numberOfLines={1}>
                {s.value}
              </Text>
            ) : null}
            <Icon name="forward" color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>

      {auth.user ? (
        <Card>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              auth.signOut().catch(err => {
                console.warn('Sign out error:', err);
              });
            }}
            style={styles.row}
          >
            <Icon name="remove" color={colors.caution} />
            <Text
              style={[styles.rowLabel, { color: colors.caution }, base.grow]}
            >
              {copy.me.logOut}
            </Text>
            <Icon name="forward" color={colors.textMuted} />
          </Pressable>
        </Card>
      ) : null}

      {auth.user?.email?.toLowerCase() === 'test@tankengo.com' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => nav.navigate('MeSection', { section: 'developer' })}
          style={styles.row}
        >
          <Icon name="developer" color={colors.textMuted} />
          <Text style={[base.caption, base.grow]}>
            {copy.meSections.developer}
          </Text>
          <Icon name="forward" color={colors.textMuted} />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => nav.navigate('MeSection', { section: 'licenses' })}
        style={styles.row}
      >
        <Icon name="learn" color={colors.textMuted} />
        <Text style={[base.caption, base.grow]}>
          {copy.meSections.licenses}
        </Text>
        <Icon name="forward" color={colors.textMuted} />
      </Pressable>

      <Text style={base.caption}>{copy.me.credits}</Text>
    </Screen>
  );
}

/** One number in the profile's stats row. */
function Stat({
  value,
  label,
  mark,
}: {
  value: number | string;
  label: string;
  mark?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {mark}
      </View>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Part of the page itself, not a card.
  profile: {
    paddingVertical: space.xl,
    justifyContent: 'space-between',
    gap: space.xl,
  },
  identity: {
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...base.text,
    fontSize: fontSizes.jumbo,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  stats: {
    flexDirection: 'row',
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
    paddingTop: space.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: space.xxs,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
  },
  statValue: {
    ...base.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  statLabel: {
    ...base.caption,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  rowDivider: {
    borderTopWidth: sizes.hairline,
    borderTopColor: colors.border,
  },
  rowLabel: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
});
