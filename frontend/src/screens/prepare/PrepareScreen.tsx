import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { RootScreenProps } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, fontWeights, radii, sizes, space } from '../../styles/tokens';

export function PrepareScreen({
  route,
  navigation,
}: RootScreenProps<'Prepare'>): React.JSX.Element {
  const { placeId } = route.params;
  const briefing = useAsync(() => getBriefing(placeId), placeId);

  return (
    <Screen
      footer={
        <>
          <Button
            label="🎙 Rehearse with staff · 2 min"
            onPress={() => navigation.navigate('Rehearse', { placeId })}
          />
          <Text style={[base.caption, styles.center]}>
            ✦ AI suggestion from reviews; may be out of date.
          </Text>
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

      <Loadable state={briefing}>
        {data => (
          <View style={base.stack}>
            <View style={base.stackSm}>
              <Jp {...data.place.name} bold size="xxl" />
              <Text style={base.caption}>
                {data.place.category} · {data.place.area}
                {data.place.note ? ` · ${data.place.note}` : ''}
              </Text>
              <View style={base.row}>
                <Chip label={`✦ ${data.source}`} tone="accent" />
              </View>
            </View>

            <Card>
              <SectionTitle
                en="What to expect"
                jp={{ text: 'お店の流れ', reading: 'おみせのながれ', romaji: 'omise no nagare' }}
                jpFrom="some"
              />
              {data.steps.map((step, i) => (
                <NumberedStep key={step} index={i + 1}>
                  <Text style={base.text}>{step}</Text>
                </NumberedStep>
              ))}
            </Card>

            <Card>
              <Text style={base.heading}>✦ Tango for this visit</Text>
              {data.tango.map(tango => (
                <View key={tango.id} style={styles.tangoRow}>
                  <View style={styles.tangoWord}>
                    <Jp {...tango} bold size="lg" />
                  </View>
                  <Text
                    style={[base.caption, base.grow]}
                    onPress={() => navigation.navigate('TangoDetail', { id: tango.id })}
                  >
                    {tango.meaning} ›
                  </Text>
                </View>
              ))}
            </Card>

            <Card>
              <View style={base.rowBetween}>
                <Text style={base.heading}>History here</Text>
                <Text style={base.caption}>Your first visit</Text>
              </View>
              <Text style={base.caption}>
                From other learners' debriefs. Fully anonymous: no names, no
                accounts, no exact times.
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

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
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
