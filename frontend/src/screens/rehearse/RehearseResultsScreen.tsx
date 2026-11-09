import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getRehearsalResult, saveRehearsalSentence } from '../../api/rehearse';
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
import type { SentenceTango } from '../../types';
import { base } from '../../styles/base';
import { colors, fontWeights, radii, space } from '../../styles/tokens';
import { copy } from '../../copy';

/** Shown while loading: build anticipation, not impatience. */
const RESULT_LINES = [
  ...copy.rehearseResults.loadingLines,
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
            label={copy.rehearseResults.rehearseAgain}
            variant="secondary"
            style={base.grow}
            onPress={() => navigation.replace('Rehearse', { placeId })}
          />
          <Button
            label={copy.rehearseResults.ready}
            style={base.grow}
            onPress={() => navigation.popToTop()}
          />
        </View>
      }
    >
      <ScreenHeader onBack={() => navigation.popToTop()} close>
        <Text style={base.heading}>{copy.rehearseResults.title}</Text>
      </ScreenHeader>
      <Loadable state={result} messages={RESULT_LINES}>
        {data => (
          <View style={base.stack}>
            <Text style={base.title}>{copy.rehearseResults.niceWork}</Text>
            <View style={base.row}>
              <Jp {...data.place.name} size="sm" tone="muted" />
              <Text style={base.caption}>
                {copy.rehearseResults.hintsUsed(hintsUsed)}
              </Text>
            </View>
            <IconLabel icon="ai" style={styles.eyebrow}>
              {copy.rehearseResults.feedbackBy}
            </IconLabel>
            {data.lines.map(line => (
              <Card key={line.staff.text}>
                <View style={base.row}>
                  <Text style={base.caption}>
                    {copy.rehearseResults.staff}
                  </Text>
                  <Jp {...line.staff} size="sm" tone="muted" />
                </View>
                <View style={base.row}>
                  <Text style={line.ok ? styles.ok : styles.warn}>
                    {line.ok
                      ? copy.rehearseResults.okMark
                      : copy.rehearseResults.notQuiteMark}
                  </Text>
                  <Jp {...line.said} size="lg" />
                </View>
                {line.saidTango.length > 0 ? (
                  <SaveSentenceButton
                    label={copy.rehearseResults.saveYours}
                    onSave={() =>
                      saveRehearsalSentence(
                        rehearsalId ?? '',
                        line.turnId,
                        false,
                        line.saidTango,
                      )
                    }
                  />
                ) : null}
                {line.suggestion ? (
                  <View style={styles.suggestion}>
                    <View style={base.grow}>
                      <IconLabel icon="ai" style={styles.eyebrow}>
                        {copy.rehearseResults.geminiSuggests}
                      </IconLabel>
                      <Jp {...line.suggestion.jp} size="lg" bold />
                      <Text style={base.caption}>{line.suggestion.why}</Text>
                      {line.suggestionTango.length > 0 ? (
                        <SaveSentenceButton
                          label={copy.rehearseResults.saveSuggested}
                          onSave={() =>
                            saveRehearsalSentence(
                              rehearsalId ?? '',
                              line.turnId,
                              true,
                              line.suggestionTango,
                            )
                          }
                        />
                      ) : null}
                    </View>
                    <IconButton
                      icon="play"
                      label={copy.rehearseResults.playSuggestion}
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

/** Saves a line to its Tango, then says where it was saved. */
function SaveSentenceButton({
  label,
  onSave,
}: {
  label: string;
  onSave: () => Promise<SentenceTango[]>;
}): React.JSX.Element {
  const [saved, setSaved] = useState<SentenceTango[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (saved) {
    return (
      <IconLabel icon="done" style={styles.saved}>
        {copy.rehearseResults.savedTo(saved.map(t => t.text))}
      </IconLabel>
    );
  }
  return (
    <View style={base.stackSm}>
      <Button
        label={label}
        icon="add"
        variant="secondary"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setFailed(false);
          try {
            setSaved(await onSave());
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      />
      {failed ? (
        <Text style={styles.warn}>{copy.rehearseResults.couldNotSave}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  saved: {
    ...base.caption,
    color: colors.positive,
    fontWeight: fontWeights.bold,
  },
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
