import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getReviewSession,
  getSessionResult,
  submitAnswer,
} from '../../api/review';
import { Jp } from '../../components/Jp';
import {
  Button,
  Card,
  IconButton,
  IconLabel,
  Loadable,
  ProgressBar,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { RootNavigation, RootScreenProps } from '../../navigation/types';
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
import type {
  Exercise,
  FillGapExercise,
  MultipleChoiceExercise,
} from '../../types';
import { Icon } from '../../components/Icon';

/** Shown while loading: build anticipation, not impatience. */
const SESSION_LINES = [
  'Shuffling your Tango…',
  "Picking today's best practice…",
];

export function ReviewSessionScreen({
  route,
  navigation,
}: RootScreenProps<'ReviewSession'>): React.JSX.Element {
  const collectionId = route.params?.collectionId;
  const { settings } = useSettings();
  const session = useAsync(
    () => getReviewSession(collectionId, settings.explanationsLanguage),
    `${collectionId ?? 'all'}:${settings.explanationsLanguage}`,
  );
  const [finished, setFinished] = useState(false);
  const sessionId = session.data?.sessionId ?? null;

  return (
    <SafeAreaView style={base.screen}>
      {finished ? (
        <Results navigation={navigation} sessionId={sessionId} />
      ) : (
        <Loadable state={session} messages={SESSION_LINES}>
          {data => (
            <Session
              exercises={data.exercises}
              sessionId={data.sessionId}
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
  sessionId,
  onClose,
  onFinish,
}: {
  exercises: Exercise[];
  sessionId: string | null;
  onClose: () => void;
  onFinish: () => void;
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [showPlace, setShowPlace] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const inFlightSubmitsRef = useRef<Promise<unknown>[]>([]);
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
    const p = submitAnswer(
      exercise.tangoId,
      option === exercise.answerIndex,
      sessionId,
    ).catch(() => {
      // Not fatal for the session; the answer just won't count.
    });
    inFlightSubmitsRef.current.push(p);
  };

  const next = async () => {
    if (index + 1 >= exercises.length) {
      if (finishing) {
        return;
      }
      setFinishing(true);
      await Promise.all(inFlightSubmitsRef.current);
      onFinish();
    } else {
      setPicked(null);
      setShowPlace(false);
      setIndex(index + 1);
    }
  };

  return (
    <View style={base.grow}>
      <View style={[base.row, styles.header]}>
        <IconButton icon="close" label="End review" onPress={onClose} />
        <ProgressBar
          value={(index + (picked === null ? 0 : 1)) / exercises.length}
        />
        {exercise.type === 'multiple_choice' && picked === null ? (
          <IconButton
            icon="hint"
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
            <FillGap
              exercise={exercise}
              index={index}
              total={exercises.length}
              onPick={pick}
            />
          )
        ) : (
          <Feedback
            exercise={exercise}
            correct={picked === exercise.answerIndex}
          />
        )}
      </ScrollView>
      {picked !== null ? (
        <View style={styles.footer}>
          <Button
            label="Continue"
            variant="dark"
            disabled={finishing}
            onPress={next}
          />
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
        <View style={styles.centerRow}>
          <IconLabel icon="pin" style={base.caption}>
            {exercise.placeHint}
          </IconLabel>
        </View>
      ) : (
        <Text style={[styles.link, styles.center]} onPress={onShowPlace}>
          Where did I see this Tango?
        </Text>
      )}
    </View>
  );
}

/** Until the real size is known: the upload size is 4:3. */
const PHOTO_ASPECT = 4 / 3;

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
  const imageUrl = exercise.photo.imageUrl;
  // Frame matches the photo's shape, so the normalized gap box lines up.
  const [aspect, setAspect] = useState(PHOTO_ASPECT);
  useEffect(() => {
    if (!imageUrl) {
      return;
    }
    let alive = true;
    Image.getSize(
      imageUrl,
      (w, h) => alive && h > 0 && setAspect(w / h),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [imageUrl]);
  const gapStyle = {
    left: `${gap.x * 100}%` as const,
    top: `${gap.y * 100}%` as const,
    width: `${gap.w * 100}%` as const,
    height: `${gap.h * 100}%` as const,
  };
  return (
    <View style={base.stack}>
      <Text style={base.label}>
        Fill the gap · {index + 1} of {total}
      </Text>
      {imageUrl ? (
        // The user's own photo, with the caught item covered.
        <View style={[styles.realPhoto, { aspectRatio: aspect }]}>
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="stretch"
            accessibilityLabel="Your photo with one item covered"
          />
          <View style={[styles.gap, styles.gapSolid, gapStyle]}>
            <Text style={styles.gapMark}>?</Text>
          </View>
        </View>
      ) : (
        <View style={styles.photo}>
          <View style={styles.sign}>
            <Icon
              name="forbidden"
              size={fontSizes.xxl}
              color={colors.hanamaru}
            />
            {exercise.photo.lines.map((line, i) =>
              line ? (
                <Jp
                  key={`${line}-${i}`}
                  text={line}
                  size="lg"
                  bold
                  alwaysKanji
                />
              ) : (
                <View key={`gap-${i}`} style={styles.gapRow} />
              ),
            )}
            <View style={[styles.gap, gapStyle]} />
          </View>
        </View>
      )}
      <IconLabel icon="pin" style={base.caption}>
        {exercise.photo.caption}
      </IconLabel>
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
      <IconLabel icon="ai" style={styles.note}>
        {exercise.note}
      </IconLabel>
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
          <Icon
            name={correct ? 'done' : 'close'}
            size={fontSizes.xxl}
            color={correct ? colors.positive : colors.caution}
          />
        </View>
        <Text style={[styles.verdict, !correct && styles.wrong]}>
          {correct ? 'Correct!' : 'Not quite'}
        </Text>
        {!correct ? (
          <Text style={base.caption}>The answer was “{answer}”.</Text>
        ) : null}
      </View>
      {exercise.type === 'multiple_choice' ? (
        <>
          <Card>
            <View style={base.row}>
              <Jp {...exercise.prompt} size="xl" bold />
              <Text style={base.caption}>
                {exercise.prompt.reading} ·{' '}
                {exercise.options[exercise.answerIndex]}
              </Text>
            </View>
            {exercise.example ? (
              <View style={styles.example}>
                <Jp
                  text={exercise.example.text ?? ''}
                  reading={exercise.example.reading}
                  romaji={exercise.example.romaji}
                />
                <Text style={base.caption}>{exercise.example.en}</Text>
              </View>
            ) : null}
            <IconLabel icon="pin" style={base.caption}>
              {exercise.placeHint}
            </IconLabel>
          </Card>
          {correct ? (
            <Text style={styles.next}>{exercise.nextStep}</Text>
          ) : null}
        </>
      ) : (
        <Card>
          <Jp
            {...exercise.options[exercise.answerIndex]}
            size="xl"
            bold
            alwaysKanji
          />
          <IconLabel icon="pin" style={base.caption}>
            {exercise.photo.caption}
          </IconLabel>
        </Card>
      )}
    </View>
  );
}

function Results({
  navigation,
  sessionId,
}: {
  navigation: RootNavigation;
  sessionId: string | null;
}): React.JSX.Element {
  const result = useAsync(
    () => getSessionResult(sessionId),
    sessionId ?? 'mock',
  );
  return (
    <Loadable state={result}>
      {r => (
        <View style={base.grow}>
          <ScrollView contentContainerStyle={base.content}>
            <View style={styles.prompt}>
              <View style={styles.badge}>
                <Icon
                  name="award"
                  size={fontSizes.xxl}
                  color={colors.positive}
                />
              </View>
              <Text style={styles.verdict}>Excellent work!</Text>
              <Text style={base.caption}>
                {r.reviewed} Tango reviewed · {r.minutes} min
              </Text>
            </View>

            {r.biggestWin ? (
              <>
                <Text style={styles.eyebrow}>Biggest win today</Text>
                <Card>
                  <View style={base.row}>
                    <View style={styles.winIcon}>
                      <Icon
                        name="pin"
                        size={fontSizes.xl}
                        color={colors.accent}
                      />
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
              </>
            ) : null}

            {r.byArea.length > 0 ? (
              <Card>
                <Text style={base.heading}>Tango practiced</Text>
                {r.byArea.map(row => (
                  <View key={row.area} style={base.rowBetween}>
                    <Text style={base.text}>{row.area}</Text>
                    <Text style={styles.strong}>{row.count} Tango</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {r.next ? (
              <Card variant="soft">
                <View style={base.row}>
                  <IconLabel icon="calendar" style={base.text}>
                    {r.next.label}
                  </IconLabel>
                  <Jp {...r.next.placeName} bold />
                  <Text style={base.text}>on {r.next.day}.</Text>
                </View>
              </Card>
            ) : null}
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
            {r.next ? (
              <Button
                label="Prepare next"
                style={base.grow}
                onPress={() =>
                  r.next &&
                  navigation.replace('Prepare', { placeId: r.next.placeId })
                }
              />
            ) : null}
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
  centerRow: {
    alignItems: 'center',
  },
  gapRow: {
    height: space.xxl,
  },
  realPhoto: {
    width: '100%',
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.camera,
  },
  gapSolid: {
    borderStyle: 'solid',
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapMark: {
    ...base.heading,
    color: colors.accent,
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
