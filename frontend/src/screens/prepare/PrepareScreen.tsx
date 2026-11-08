import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createVisit, getPlace } from '../../api/places';
import { getBriefing } from '../../api/prepare';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import {
  Button,
  Card,
  Chip,
  Loadable,
  NumberedStep,
  SectionTitle,
  IconLabel,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { RootScreenProps } from '../../navigation/types';
import { useSettings } from '../../state/SettingsContext';
import { base } from '../../styles/base';
import { colors, fontWeights, radii, sizes, space } from '../../styles/tokens';
import { Icon } from '../../components/Icon';

/** Shown while loading: build anticipation, not impatience. */
const PREPARE_LINES = [
  'Reading what visitors say about this place…',
  "Picking the words you'll hear at the counter…",
  'Planning your first moves inside…',
];

export function PrepareScreen({
  route,
  navigation,
}: RootScreenProps<'Prepare'>): React.JSX.Element {
  const { placeId } = route.params;
  const { settings } = useSettings();
  const briefing = useAsync(async () => {
    const [b, p] = await Promise.all([
      getBriefing(placeId, settings.explanationsLanguage),
      getPlace(placeId).catch(() => null),
    ]);
    return p ? { ...b, place: p } : b;
  }, `${placeId}:${settings.explanationsLanguage}`);
  const [planned, setPlanned] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const plan = async (label: string, when: Date) => {
    setPlanError(null);
    try {
      await createVisit(placeId, when.toISOString());
      setPlanned(label);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Could not save');
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button
            icon="mic"
            label="Rehearse with staff · 2 min"
            onPress={() => navigation.navigate('Rehearse', { placeId })}
          />
          <View style={styles.center}>
            <IconLabel icon="ai" style={base.caption}>
              AI suggestion from reviews; may be out of date.
            </IconLabel>
          </View>
        </>
      }
    >
      <ScreenHeader onBack={() => navigation.goBack()}>
        <SectionTitle
          en="Prepare"
          jp={{ text: '準備', reading: 'じゅんび', romaji: 'junbi' }}
          jpFrom="some"
        />
      </ScreenHeader>

      <Loadable state={briefing} messages={PREPARE_LINES}>
        {data => (
          <View style={base.stack}>
            <View style={base.stackSm}>
              <Jp {...data.place.name} bold size="xxl" />
              <Text style={base.caption}>
                {data.place.category} · {data.place.area}
                {data.place.note ? ` · ${data.place.note}` : ''}
              </Text>
              <View style={base.row}>
                <Chip icon="ai" label={data.source} tone="accent" />
              </View>
            </View>

            <Card>
              <Text style={base.heading}>Add to your plans</Text>
              {planned ? (
                <IconLabel icon="done" style={styles.planned}>
                  Planned for {planned.toLowerCase()}
                </IconLabel>
              ) : (
                <View style={base.wrap}>
                  {planOptions().map(option => (
                    <Chip
                      key={option.label}
                      label={option.label}
                      tone="outline"
                      onPress={() => plan(option.label, option.when)}
                    />
                  ))}
                </View>
              )}
              {planError ? <Text style={styles.error}>{planError}</Text> : null}
            </Card>

            <Card>
              <SectionTitle
                en="What to expect"
                jp={{
                  text: 'お店の流れ',
                  reading: 'おみせのながれ',
                  romaji: 'omise no nagare',
                }}
                jpFrom="some"
              />
              {data.steps.map((step, i) => (
                <NumberedStep key={step} index={i + 1}>
                  <Text style={base.text}>{step}</Text>
                </NumberedStep>
              ))}
            </Card>

            <Card>
              <IconLabel icon="ai" style={base.heading}>
                Tango for this visit
              </IconLabel>
              {data.tango.map(tango => {
                const owned = tango.tangoId;
                return (
                  <View key={tango.text} style={styles.tangoRow}>
                    <View style={styles.tangoWord}>
                      <Jp {...tango} bold size="lg" />
                    </View>
                    <Text
                      style={[base.caption, base.grow]}
                      onPress={
                        owned
                          ? () =>
                              navigation.navigate('TangoDetail', { id: owned })
                          : undefined
                      }
                    >
                      {tango.meaning}
                    </Text>
                    {owned ? (
                      <Icon name="forward" color={colors.textMuted} />
                    ) : null}
                  </View>
                );
              })}
            </Card>

            <Card>
              <View style={base.rowBetween}>
                <Text style={base.heading}>History here</Text>
                <Text style={base.caption}>Your first visit</Text>
              </View>
              <Text style={base.caption}>
                Anonymous tips from other learners
              </Text>
              {data.tips.length === 0 ? (
                <Text style={base.caption}>No tips for this place yet.</Text>
              ) : null}
              {data.tips.map(tip => (
                <View key={tip.id} style={styles.tip}>
                  <Text style={base.text}>"{tip.quote}"</Text>
                  <View style={base.rowBetween}>
                    <Text style={base.caption}>
                      {tip.learners} learners · {tip.when}
                    </Text>
                    {tip.inRehearsal ? (
                      <Text style={styles.inRehearsal}>In your rehearsal</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}
      </Loadable>
    </Screen>
  );
}

/** Quick plan choices at noon local time: today, tomorrow, Saturday. */
function planOptions(): { label: string; when: Date }[] {
  const at = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(12, 0, 0, 0);
    return d;
  };
  const toSaturday = (6 - new Date().getDay() + 7) % 7 || 7;
  return [
    { label: 'Today', when: at(0) },
    { label: 'Tomorrow', when: at(1) },
    { label: 'This weekend', when: at(toSaturday) },
  ];
}

const styles = StyleSheet.create({
  planned: {
    ...base.text,
    color: colors.positive,
    fontWeight: fontWeights.bold,
  },
  error: {
    ...base.caption,
    color: colors.caution,
  },
  center: {
    alignItems: 'center',
  },
  tangoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xs,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  tangoWord: {
    minWidth: space.xxl * 3,
  },
  tip: {
    backgroundColor: colors.bg,
    padding: space.md,
    gap: space.xs,
    borderRadius: radii.sm,
  },
  inRehearsal: {
    ...base.caption,
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
});
