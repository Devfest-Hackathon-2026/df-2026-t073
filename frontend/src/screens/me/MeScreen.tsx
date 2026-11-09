import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getReviewSummary } from '../../api/review';
import { getProfile } from '../../api/user';
import { Hanamaru } from '../../components/Hanamaru';
import { Icon, type IconName } from '../../components/Icon';
import { Screen } from '../../components/layout';
import { Card, Loadable, SectionTitle } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
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

/** Me: who you are and how you're doing at a glance; settings one tap away. */
export function MeScreen(): React.JSX.Element {
  const nav = useRootNav();
  const { settings } = useSettings();
  const auth = useAuth();
  const profile = useAsync(getProfile);
  const review = useAsync(getReviewSummary);
  useReloadOnFocus(profile.reload, review.reload);

  const sections: {
    id: MeSectionId;
    icon: IconName;
    title: string;
    value?: string;
  }[] = [
    { id: 'profile', icon: 'me', title: copy.meSections.profile },
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
    <Screen edges={['top']}>
      <SectionTitle en={copy.me.title} size="title" />
      <Loadable state={profile} messages={LINES}>
        {p => (
          <View style={base.stack}>
            <Pressable
              accessibilityRole="button"
              onPress={() => nav.navigate('MeSection', { section: 'profile' })}
              style={styles.header}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.name.charAt(0)}</Text>
              </View>
              <View style={base.grow}>
                <Text style={base.heading} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={base.caption} numberOfLines={1}>
                  {p.levelNote}
                </Text>
              </View>
              <Icon name="forward" color={colors.textMuted} />
            </Pressable>

            <View style={styles.grid}>
              <Metric value={p.stats.tango} label={copy.me.statTango} />
              <Metric
                value={p.stats.stars}
                label={copy.me.statStamps}
                mark={<Hanamaru size={fontSizes.lg} />}
              />
              <Metric value={p.stats.places} label={copy.me.statPlaces} />
              <Metric
                value={review.data?.dueCount ?? '–'}
                label={copy.me.statDue}
                accent
              />
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

      <Text style={base.caption}>{copy.me.credits}</Text>
    </Screen>
  );
}

function Metric({
  value,
  label,
  mark,
  accent = false,
}: {
  value: number | string;
  label: string;
  mark?: React.ReactNode;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.metric}>
      <View style={base.row}>
        <Text style={[styles.metricValue, accent && styles.metricAccent]}>
          {value}
        </Text>
        {mark}
      </View>
      <Text style={base.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.md,
  },
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  metric: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
    gap: space.xxs,
  },
  metricValue: {
    ...base.text,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  metricAccent: {
    color: colors.accent,
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
