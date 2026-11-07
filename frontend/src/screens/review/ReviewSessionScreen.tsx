import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getReviewSession, getSessionResult, submitAnswer } from '../../api/review';
import { Jp } from '../../components/Jp';
import { Button, Card, IconButton, Loadable, ProgressBar } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { RootNavigation, RootScreenProps } from '../../navigation/types';
import { base } from '../../styles/base';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  sizes,
  space,
} from '../../styles/tokens';
import type {
  Exercise,
  FillGapExercise,
  MultipleChoiceExercise,
} from '../../types';

export function ReviewSessionScreen({
  route,
  navigation,
}: RootScreenProps<'ReviewSession'>): React.JSX.Element {
  const collectionId = route.params?.collectionId;
  const session = useAsync(() => getReviewSession(collectionId), collectionId ?? 'all');
  const [finished, setFinished] = useState(false);

  return (
    <SafeAreaView style={base.screen}>
      {finished ? (
        <Results navigation={navigation} />
      ) : (
        <Loadable state={session}>
          {exercises => (
            <Session
              exercises={exercises}
              onClose={() => navigation.goBack()}
              onFinish={() => setFinished(true)}
            />
          )}
        </Loadable>
      )}
    </SafeAreaView>
  );
}

function Session({
  exercises,
  onClose,
  onFinish,
}: {
  exercises: Exercise[];
  onClose: () => void;
  onFinish: () => void;
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [showPlace, setShowPlace] = useState(false);
  const exercise = exercises[index];

  if (!exercise) {
    return (
      <View style={base.content}>
        <Text style={base.heading}>Nothing due right now.</Text>
        <Button label="Close" onPress={onClose} />
      </View>
    );
  }

  const pick = (option: number) => {
    setPicked(option);
    submitAnswer(exercise.tangoId, option === exercise.answerIndex).catch(() => {
      // Mock never fails; the real call can be retried later.
    });
  };

  const next = () => {
    setPicked(null);
    setShowPlace(false);
    if (index + 1 >= exercises.length) {
      onFinish();
    } else {
      setIndex(index + 1);
    }
  };

  return (
    <View style={base.grow}>
      <View style={[base.row, styles.header]}>
        <IconButton glyph="✕" label="End review" onPress={onClose} />
        <ProgressBar value={(index + (picked === null ? 0 : 1)) / exercises.length} />
        {exercise.type === 'multiple_choice' && picked === null ? (
          <IconButton
            glyph="💡"
            label="Where did I see this Tango?"
            onPress={() => setShowPlace(true)}
          />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={base.content}>
        {picked === null ? (
          exercise.type === 'multiple_choice' ? (
            <MultipleChoice
              exercise={exercise}
              index={index}
              total={exercises.length}
              showPlace={showPlace}
              onPick={pick}
              onShowPlace={() => setShowPlace(true)}
            />
          ) : (
            <FillGap exercise={exercise} index={index} total={exercises.length} onPick={pick} />
          )
        ) : (
          <Feedback exercise={exercise} correct={picked === exercise.answerIndex} />
        )}
      </ScrollView>
      {picked !== null ? (
        <View style={styles.footer}>
          <Button label="Continue" variant="dark" onPress={next} />
        </View>
      ) : null}
    </View>
  );
}

function MultipleChoice({
  exercise,
  index,
  total,
  showPlace,
  onPick,
  onShowPlace,
}: {
  exercise: MultipleChoiceExercise;
  index: number;
  total: number;
  showPlace: boolean;
  onPick: (option: number) => void;
  onShowPlace: () => void;
}): React.JSX.Element {
  return (
    <View style={base.stack}>
      <Text style={base.label}>
        Multiple choice · {index + 1} of {total}
      </Text>
      <View style={styles.prompt}>
        <Jp {...exercise.prompt} size="jumbo" bold />
        <Text style={base.caption}>What does this mean?</Text>
      </View>
      {exercise.options.map((option, i) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          onPress={() => onPick(i)}
          style={styles.option}
        >
          <Text style={base.text}>{option}</Text>
        </Pressable>
      ))}
      {showPlace ? (
        <Text style={[base.caption, styles.center]}>⌖ {exercise.placeHint}</Text>
      ) : (
        <Text style={[styles.link, styles.center]} onPress={onShowPlace}>
          Where did I see this Tango?
        </Text>
      )}
    </View>
  );
}

function FillGap({
  exercise,
  index,
  total,
  onPick,
}: {
  exercise: FillGapExercise;
  index: number;
  total: number;
  onPick: (option: number) => void;
}): React.JSX.Element {
  const { gap } = exercise;
  return (
    <View style={base.stack}>
      <Text style={base.label}>
        Fill the gap · {index + 1} of {total}
      </Text>
      <View style={styles.photo}>
        <View style={styles.sign}>
          <Text style={styles.signIcon}>⛔</Text>
          {exercise.photo.lines.map((line, i) =>
            line ? (
              <Jp key={`${line}-${i}`} text={line} size="lg" bold alwaysKanji />
            ) : (
              <View key={`gap-${i}`} style={styles.gapRow} />
            ),
          )}
          <View
            style={[
              styles.gap,
              {
                left: `${gap.x * 100}%` as const,
                top: `${gap.y * 100}%` as const,
                width: `${gap.w * 100}%` as const,
                height: `${gap.h * 100}%` as const,
              },
            ]}
          />
        </View>
      </View>
      <Text style={base.caption}>⌖ {exercise.photo.caption}</Text>
      <Text style={base.heading}>What goes in the gap?</Text>
      <View style={base.wrap}>
        {exercise.options.map((option, i) => (
          <Pressable
            key={option.text}
            accessibilityRole="button"
            onPress={() => onPick(i)}
            style={[styles.option, styles.gridOption]}
          >
            <Jp {...option} size="lg" alwaysKanji />
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>✦ {exercise.note}</Text>
    </View>
  );
}

function Feedback({
  exercise,
  correct,
}: {
  exercise: Exercise;
  correct: boolean;
}): React.JSX.Element {
  const answer =
    exercise.type === 'multiple_choice'
      ? exercise.options[exercise.answerIndex]
      : exercise.options[exercise.answerIndex].text;
  return (
    <View style={base.stack}>
      <View style={styles.prompt}>
        <View style={[styles.badge, !correct && styles.badgeWrong]}>
          <Text style={[styles.badgeGlyph, !correct && styles.wrong]}>
            {correct ? '✓' : '✕'}
          </Text>
        </View>
        <Text style={[styles.verdict, !correct && styles.wrong]}>
          {correct ? 'Correct!' : 'Not quite'}
        </Text>
        {!correct ? <Text style={base.caption}>The answer was “{answer}”.</Text> : null}
      </View>
      {exercise.type === 'multiple_choice' ? (
        <>
          <Card>
            <View style={base.row}>
              <Jp {...exercise.prompt} size="xl" bold />
              <Text style={base.caption}>
                {exercise.prompt.reading} · {exercise.options[exercise.answerIndex]}
              </Text>
            </View>
            <View style={styles.example}>
              <Jp {...exercise.example} />
              <Text style={base.caption}>{exercise.example.en}</Text>
            </View>
            <Text style={base.caption}>⌖ {exercise.placeHint}</Text>
          </Card>
          {correct ? <Text style={styles.next}>{exercise.nextStep}</Text> : null}
        </>
      ) : (
        <Card>
          <Jp {...exercise.options[exercise.answerIndex]} size="xl" bold alwaysKanji />
          <Text style={base.caption}>⌖ {exercise.photo.caption}</Text>
        </Card>
      )}
    </View>
  );
}

function Results({ navigation }: { navigation: RootNavigation }): React.JSX.Element {
  const result = useAsync(getSessionResult);
  return (
    <Loadable state={result}>
      {r => (
        <View style={base.grow}>
          <ScrollView contentContainerStyle={base.content}>
            <View style={styles.prompt}>
              <View style={styles.badge}>
                <Text style={styles.badgeGlyph}>🏆</Text>
              </View>
              <Text style={styles.verdict}>Excellent work!</Text>
              <Text style={base.caption}>
                {r.reviewed} Tango reviewed · {r.minutes} min
              </Text>
            </View>

            <Text style={styles.eyebrow}>Biggest win today</Text>
            <Card>
              <View style={base.row}>
                <View style={styles.winIcon}>
                  <Text style={styles.badgeGlyph}>⌖</Text>
                </View>
                <View style={base.grow}>
                  <View style={base.row}>
                    <Jp {...r.biggestWin.tango} bold />
                    <Text style={styles.strong}>{r.biggestWin.title}</Text>
                  </View>
                  <Text style={base.caption}>{r.biggestWin.detail}</Text>
                </View>
              </View>
            </Card>

            <Card>
              <Text style={base.heading}>Tango practiced</Text>
              {r.byArea.map(row => (
                <View key={row.area} style={base.rowBetween}>
                  <Text style={base.text}>{row.area}</Text>
                  <Text style={styles.strong}>{row.count} Tango</Text>
                </View>
              ))}
            </Card>

            <Card variant="soft">
              <View style={base.row}>
                <Text style={base.text}>📅 {r.next.label}</Text>
                <Jp {...r.next.placeName} bold />
                <Text style={base.text}>on {r.next.day}.</Text>
              </View>
            </Card>
          </ScrollView>
          <View style={[base.row, styles.footer]}>
            <Button
              label="Back to Today"
              variant="secondary"
              style={base.grow}
              onPress={() => {
                navigation.popToTop();
                navigation.navigate('Tabs', { screen: 'Today' });
              }}
            />
            <Button
              label="Prepare next"
              style={base.grow}
              onPress={() => navigation.replace('Prepare', { placeId: r.next.placeId })}
            />
          </View>
        </View>
      )}
    </Loadable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  footer: {
    padding: space.lg,
  },
  prompt: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.lg,
  },
  option: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    padding: space.lg,
  },
  gridOption: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  link: {
    ...base.caption,
    color: colors.accent,
  },
  photo: {
    backgroundColor: colors.camera,
    borderRadius: radii.lg,
    padding: space.lg,
    alignItems: 'center',
  },
  sign: {
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    gap: space.sm,
    minWidth: sizes.mapHeight,
  },
  signIcon: {
    fontSize: fontSizes.jumbo,
  },
  gapRow: {
    height: space.xxl,
  },
  gap: {
    position: 'absolute',
    borderWidth: sizes.border,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
  },
  note: {
    ...base.caption,
    color: colors.accent,
  },
  badge: {
    width: sizes.shutter,
    height: sizes.shutter,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrong: {
    backgroundColor: colors.border,
  },
  winIcon: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGlyph: {
    fontSize: fontSizes.xxl,
    color: colors.positive,
  },
  verdict: {
    ...base.title,
    color: colors.positive,
  },
  wrong: {
    color: colors.caution,
  },
  example: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: space.md,
    gap: space.xs,
  },
  next: {
    ...base.caption,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: space.md,
    fontWeight: fontWeights.bold,
  },
  eyebrow: {
    ...base.label,
    color: colors.caution,
  },
  strong: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
});
