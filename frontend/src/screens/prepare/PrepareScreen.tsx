import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getPlace, listVisits } from '../../api/places';
import { listTangoAtPlace } from '../../api/tango';
import { getBriefing } from '../../api/prepare';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import {
  Button,
  Card,
  Chip,
  Facts,
  IconLabel,
  Loadable,
  NumberedStep,
  SectionTitle,
} from '../../components/ui';
import { FavoriteHeart } from '../../features/places/FavoriteHeart';
import { useFavoritePlaces } from '../../features/places/useFavoritePlaces';
import { PlanVisitSheet } from '../../features/plans/PlanVisitSheet';
import { useAsync } from '../../hooks/useAsync';
import type { RootScreenProps } from '../../navigation/types';
import { useSettings } from '../../state/SettingsContext';
import { formatVisitTime } from '../../utils/format';
import { base } from '../../styles/base';
import { colors, fontWeights, radii, sizes, space } from '../../styles/tokens';
import { Icon } from '../../components/Icon';
import { copy } from '../../copy';

/** Shown while loading: build anticipation, not impatience. */
const PREPARE_LINES = copy.prepare.loadingLines;

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
  const favorites = useFavoritePlaces();
  const visits = useAsync(listVisits);
  const planned = visits.data?.find(v => v.place.id === placeId) ?? null;
  const [planning, setPlanning] = useState(false);
  // First time here: none of the user's Tango were seen at this place.
  const here = useAsync(() => listTangoAtPlace(placeId), placeId);
  const firstTime = here.data !== undefined && here.data.length === 0;

  return (
    <Screen
      footer={
        <>
          <Button
            icon="mic"
            label={copy.prepare.rehearse}
            onPress={() => navigation.navigate('Rehearse', { placeId })}
          />
          <View style={styles.center}>
            <IconLabel icon="time" style={base.caption}>
              {copy.prepare.rehearseTime}
            </IconLabel>
            <IconLabel icon="ai" style={base.caption}>
              {copy.prepare.aiNote}
            </IconLabel>
          </View>
        </>
      }
    >
      <ScreenHeader
        onBack={() => navigation.goBack()}
        right={
          <FavoriteHeart
            placeId={placeId}
            name={briefing.data?.place.name.text ?? ''}
            favorites={favorites}
          />
        }
      >
        <SectionTitle
          en={copy.prepare.title}
          jp={copy.prepare.titleJp}
          jpFrom="some"
        />
      </ScreenHeader>

      <Loadable state={briefing} messages={PREPARE_LINES}>
        {data => (
          <View style={base.stack}>
            <View style={base.stackSm}>
              <Jp {...data.place.name} bold size="xxl" furigana={false} />
              <Facts
                items={[
                  { icon: 'category', text: data.place.category },
                  { icon: 'pin', text: data.place.area },
                  { icon: 'hint', text: data.place.note },
                ]}
              />
              <View style={base.row}>
                <Chip icon="ai" label={data.source} tone="accent" />
              </View>
            </View>

            <Card>
              <View style={base.rowBetween}>
                {planned ? (
                  <View>
                    <IconLabel icon="done" style={styles.planned}>
                      {copy.plans.planned}
                    </IconLabel>
                    <Text style={base.text}>
                      {formatVisitTime(planned.when)}
                    </Text>
                  </View>
                ) : (
                  <IconLabel icon="calendar" style={base.text}>
                    {copy.plans.notPlanned}
                  </IconLabel>
                )}
                <Button
                  label={planned ? copy.plans.change : copy.plans.planVisit}
                  variant="secondary"
                  onPress={() => setPlanning(true)}
                />
              </View>
              <PlanVisitSheet
                visible={planning}
                onClose={() => setPlanning(false)}
                place={{ id: placeId, name: data.place.name.text }}
                visits={visits.data ?? []}
                onSaved={visits.reload}
              />
            </Card>

            <Card>
              <SectionTitle
                en={copy.prepare.whatToExpect}
                jp={copy.prepare.whatToExpectJp}
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
                {copy.prepare.tangoForVisit}
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
              <Text style={base.heading}>{copy.prepare.learnerTips}</Text>
              {firstTime ? (
                <View style={styles.firstTime}>
                  <Text style={styles.firstTimeText}>
                    {copy.prepare.firstTime}
                  </Text>
                </View>
              ) : null}
              <Text style={base.caption}>{copy.prepare.tipsSubtitle}</Text>
              {data.tips.length === 0 ? (
                <Text style={base.caption}>{copy.prepare.noTips}</Text>
              ) : null}
              {data.tips.map(tip => (
                <View key={tip.id} style={styles.tip}>
                  <Text style={base.text}>{copy.prepare.tipQuote(tip.quote)}</Text>
                  <View style={base.rowBetween}>
                    <Facts
                      items={[
                        { icon: 'people', text: copy.prepare.learners(tip.learners) },
                        { icon: 'time', text: tip.when },
                      ]}
                    />
                    {tip.inRehearsal ? (
                      <Text style={styles.inRehearsal}>
                        {copy.prepare.inRehearsal}
                      </Text>
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
  firstTime: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm,
    padding: space.md,
  },
  firstTimeText: {
    ...base.text,
    textAlign: 'center',
  },
  planned: {
    ...base.text,
    color: colors.positive,
    fontWeight: fontWeights.bold,
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
