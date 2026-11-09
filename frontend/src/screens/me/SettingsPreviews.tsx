import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getStaffAudio } from '../../api/rehearse';
import { playUrl, stopPlaying } from '../../audio/audio';
import { Jp } from '../../components/Jp';
import { Card, IconButton, SectionTitle } from '../../components/ui';
import { copy } from '../../copy';
import { useSettings } from '../../state/SettingsContext';
import { base } from '../../styles/base';
import { colors, radii, space } from '../../styles/tokens';
import { orderExamples } from '../../utils/format';

const P = copy.settings.preview;

/** How Japanese looks with the current display settings. */
export function DisplayPreview(): React.JSX.Element {
  return (
    <Card variant="soft">
      <View style={styles.titles}>
        <SectionTitle en={P.titleSome.en} jp={P.titleSome.jp} jpFrom="some" />
        <SectionTitle en={P.titleLot.en} jp={P.titleLot.jp} jpFrom="lot" />
      </View>
      <View style={styles.word}>
        <Jp {...P.word} size="xl" bold center />
        <Text style={base.caption}>{P.word.meaning}</Text>
      </View>
    </Card>
  );
}

/** A staff line and two phrases, as role-play will show them. */
export function PracticePreview(): React.JSX.Element {
  const { settings } = useSettings();
  useEffect(
    () => () => {
      stopPlaying();
    },
    [],
  );

  const play = async () => {
    const url = await getStaffAudio(P.staffLine.text, settings.staffSpeed);
    if (url) {
      await playUrl(url).catch(() => {});
    }
  };

  const phrases = orderExamples(
    [
      { register: 'easy' as const, jp: P.phrases.easy },
      { register: 'keigo' as const, jp: P.phrases.keigo },
    ],
    settings.phrasesFirst,
  );

  return (
    <Card variant="soft">
      <View style={styles.staffRow}>
        <View style={styles.staffBubble}>
          <Jp {...P.staffLine} />
          {settings.englishAfterRoleplayLine ? (
            <Text style={base.caption}>{P.staffEnglish}</Text>
          ) : null}
        </View>
        <IconButton icon="play" label={P.playStaff} onPress={play} />
      </View>
      {phrases.map(phrase => (
        <View key={phrase.register} style={styles.phrase}>
          <Text style={base.label}>
            {phrase.register === 'easy'
              ? copy.settings.easy
              : copy.settings.keigo}
          </Text>
          <Jp {...phrase.jp} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  titles: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  word: {
    alignItems: 'center',
    gap: space.xs,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  staffBubble: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.md,
    gap: space.xs,
  },
  phrase: {
    gap: space.xxs,
  },
});
