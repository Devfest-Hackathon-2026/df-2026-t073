import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getRehearsalResult } from '../../api/rehearse';
import { Jp } from '../../components/Jp';
import { Screen, ScreenHeader } from '../../components/layout';
import {
  Button,
  Card,
  IconButton,
  IconLabel,
  Loadable,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { RootScreenProps } from '../../navigation/types';
import { base } from '../../styles/base';
import { colors, fontWeights, radii, space } from '../../styles/tokens';

/** Shown while loading: build anticipation, not impatience. */
const RESULT_LINES = [
  'Looking back at your conversation…',
  'Picking out what went well…',
];

export function RehearseResultsScreen({
  route,
  navigation,
}: RootScreenProps<'RehearseResults'>): React.JSX.Element {
  const { placeId, hintsUsed, rehearsalId } = route.params;
  const result = useAsync(
    () => getRehearsalResult(rehearsalId, placeId),
    rehearsalId ?? placeId,
  );

  return (
    <Screen
      footer={
        <View style={base.row}>
          <Button
            label="Rehearse again"
            variant="secondary"
            style={base.grow}
            onPress={() => navigation.replace('Rehearse', { placeId })}
          />
          <Button
            label="I'm ready"
            style={base.grow}
            onPress={() => navigation.popToTop()}
          />
        </View>
      }
    >
      <ScreenHeader onBack={() => navigation.popToTop()} close>
        <Text style={base.heading}>Results</Text>
      </ScreenHeader>
      <Loadable state={result} messages={RESULT_LINES}>
        {data => (
          <View style={base.stack}>
            <Text style={base.title}>Nice work!</Text>
            <View style={base.row}>
              <Jp {...data.place.name} size="sm" tone="muted" />
              <Text style={base.caption}>
                · used {hintsUsed} hint{hintsUsed === 1 ? '' : 's'}
              </Text>
            </View>
            <IconLabel icon="ai" style={styles.eyebrow}>
              Feedback by Gemini
            </IconLabel>
            {data.lines.map(line => (
              <Card key={line.staff.text}>
                <View style={base.row}>
                  <Text style={base.caption}>Staff:</Text>
                  <Jp {...line.staff} size="sm" tone="muted" />
                </View>
                <View style={base.row}>
                  <Text style={line.ok ? styles.ok : styles.warn}>
                    {line.ok ? '○' : '△'}
                  </Text>
                  <Jp {...line.said} size="lg" />
                </View>
                {line.suggestion ? (
                  <View style={styles.suggestion}>
                    <View style={base.grow}>
                      <IconLabel icon="ai" style={styles.eyebrow}>
                        Gemini suggests
                      </IconLabel>
                      <Jp {...line.suggestion.jp} size="lg" bold />
                      <Text style={base.caption}>{line.suggestion.why}</Text>
                    </View>
                    <IconButton
                      icon="play"
                      label="Play suggestion (coming soon)"
                    />
                  </View>
                ) : (
                  <Text style={styles.ok}>{line.note}</Text>
                )}
              </Card>
            ))}
          </View>
        )}
      </Loadable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...base.label,
    color: colors.accent,
  },
  ok: {
    ...base.caption,
    color: colors.positive,
    fontWeight: fontWeights.bold,
  },
  warn: {
    ...base.caption,
    color: colors.caution,
    fontWeight: fontWeights.bold,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: space.md,
  },
});
