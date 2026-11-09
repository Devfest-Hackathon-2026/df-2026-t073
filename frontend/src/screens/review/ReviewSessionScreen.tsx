import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getReviewSession,
  getSessionResult,
  submitAnswer,
  type SessionAnswerInput,
} from '../../api/review';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import { Screen, Toast } from '../../components/layout';
import {
  Button,
  Card,
  IconButton,
  IconLabel,
  Loadable,
  ProgressBar,
} from '../../components/ui';
import {
  checkFillAnswer,
  hasNonKanaForReading,
} from '../../features/review/answerCheck';
import { QUESTION_TYPE_LABEL } from '../../features/review/labels';
import { playWord } from '../../features/tango/saveWord';
import { useAsync } from '../../hooks/useAsync';
import { formatVisitTime } from '../../utils/format';
import type {
  RootNavigation,
  RootScreenProps,
} from '../../navigation/types';
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
  FillBlankExercise,
  FlashcardExercise,
  JpText,
  McqExercise,
  PhotoLayer,
} from '../../types';
import { copy } from '../../copy';

const SESSION_LINES = copy.reviewSession.loadingLines;

/** Until the real size is known: the upload size is 4:3. */
const PHOTO_ASPECT = 4 / 3;
/** How long the flashcard result toast stays up. */
const TOAST_MS = 2500;

interface Outcome {
  exerciseId: string;
  correct: boolean;
  /** "Show answer": nothing was attempted, so no right/wrong mark. */
  revealed: boolean;
  /** The server didn't count the answer: the card moved on since the session started. */
  stale: boolean;
}

export function ReviewSessionScreen({
  route,
  navigation,
}: RootScreenProps<'ReviewSession'>): React.JSX.Element {
  const collectionId = route.params?.collectionId;
  const { settings } = useSettings();
  const session = useAsync(
    () => getReviewSession(collectionId, settings.explanationsLanguage),
    `${collectionId ?? 'due'}:${settings.explanationsLanguage}`,
  );
  const [done, setDone] = useState(false);

  return (
    <Screen scroll={false}>
      <Loadable state={session} messages={SESSION_LINES}>
        {s =>
          done ? (
            <Results navigation={navigation} sessionId={s.sessionId} />
          ) : (
            <Session
              exercises={s.exercises}
              sessionId={s.sessionId}
              onClose={() => navigation.goBack()}
              onFinish={() => setDone(true)}
            />
          )
        }
      </Loadable>
    </Screen>
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
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showPlace, setShowPlace] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [toast, setToast] = useState<FlashcardToast | null>(null);
  const inFlightSubmitsRef = useRef<Promise<unknown>[]>([]);
  const exercise = exercises[index];

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!exercise) {
    return (
      <View style={base.content}>
        <Text style={base.heading}>{copy.reviewSession.nothingDue}</Text>
        <Button label={copy.common.close} onPress={onClose} />
      </View>
    );
  }

  const submit = (answer: SessionAnswerInput) => {
    const p = submitAnswer(sessionId, exercise.id, answer).catch(() => {
      // Not fatal for the session; the answer just won't count.
      return null;
    });
    inFlightSubmitsRef.current.push(p);
    return p;
  };

  // Feedback shows right away from the exercise's own answer; the server's verdict
  // replaces it if they differ, while that exercise is still on screen.
  const recordOutcome = (correct: boolean, answer: SessionAnswerInput) => {
    const exerciseId = exercise.id;
    setOutcome({
      exerciseId,
      correct,
      revealed: answer.kind === 'reveal',
      stale: false,
    });
    submit(answer).then(verdict => {
      if (verdict) {
        setOutcome(current =>
          current?.exerciseId === verdict.exerciseId
            ? { ...current, correct: verdict.correct, stale: verdict.stale }
            : current,
        );
      }
    });
  };

  // Rating a flashcard already says how it went: no feedback screen, just a toast.
  const rateFlashcard = (
    card: FlashcardExercise,
    rating: 'again' | 'good' | 'easy',
  ) => {
    setToast(flashcardToast(card, rating));
    submit({ kind: 'flip', rating }).then(verdict => {
      if (verdict?.stale) {
        setToast(current =>
          current?.exerciseId === verdict.exerciseId
            ? { ...current, text: copy.reviewSession.toast.stale }
            : current,
        );
      }
    });
    next();
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
      setOutcome(null);
      setShowPlace(false);
      setIndex(index + 1);
    }
  };

  return (
    <View style={base.grow}>
      <View style={[base.row, styles.header]}>
        <IconButton icon="close" label={copy.reviewSession.endReview} onPress={onClose} />
        <ProgressBar
          value={(index + (outcome === null ? 0 : 1)) / exercises.length}
        />
        {outcome === null ? (
          <IconButton
            icon="hint"
            label={copy.reviewSession.hintButton}
            onPress={() => setShowPlace(true)}
          />
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={base.content}
        keyboardShouldPersistTaps="handled"
      >
        {outcome === null ? (
          exercise.type === 'flashcard' ? (
            <Flashcard
              key={exercise.id}
              exercise={exercise}
              index={index}
              total={exercises.length}
              showPlace={showPlace}
              onRate={rating => rateFlashcard(exercise, rating)}
            />
          ) : exercise.type === 'mcq' ? (
            <Mcq
              key={exercise.id}
              exercise={exercise}
              index={index}
              total={exercises.length}
              showPlace={showPlace}
              onPick={pickedIndex =>
                recordOutcome(pickedIndex === exercise.answerIndex, {
                  kind: 'pick',
                  index: pickedIndex,
                })
              }
            />
          ) : (
            <FillBlank
              key={exercise.id}
              exercise={exercise}
              index={index}
              total={exercises.length}
              showPlace={showPlace}
              onAnswer={(correct, typed) =>
                recordOutcome(
                  correct,
                  // Nothing typed: the learner pressed "Show answer".
                  typed === undefined
                    ? { kind: 'reveal' }
                    : { kind: 'typed', text: typed },
                )
              }
            />
          )
        ) : (
          <Feedback
            exercise={exercise}
            correct={outcome.correct}
            revealed={outcome.revealed}
            stale={outcome.stale}
          />
        )}
      </ScrollView>
      {outcome !== null ? (
        <View style={styles.footer}>
          <Button
            label={copy.reviewSession.continue}
            variant="dark"
            disabled={finishing}
            onPress={next}
          />
        </View>
      ) : null}
      {toast ? (
        <View style={styles.toastSlot} pointerEvents="none">
          <Toast
            message={
              <View style={base.row}>
                <Icon
                  name={toast.icon}
                  color={
                    toast.icon === 'done' ? colors.positive : colors.caution
                  }
                />
                <Text style={[base.text, base.grow]}>{toast.text}</Text>
              </View>
            }
          />
        </View>
      ) : null}
    </View>
  );
}

interface FlashcardToast {
  exerciseId: string;
  icon: 'done' | 'triangle';
  text: string;
}

/** What the toast says after rating a flashcard (no stage names, just the direction). */
export function flashcardToast(
  card: FlashcardExercise,
  rating: 'again' | 'good' | 'easy',
): FlashcardToast {
  const word = card.back.text;
  if (rating === 'again') {
    return {
      exerciseId: card.id,
      icon: 'triangle',
      text: card.demotedTo
        ? copy.reviewSession.toast.backAStep(word)
        : copy.reviewSession.toast.comeBackSoon(word),
    };
  }
  return {
    exerciseId: card.id,
    icon: 'done',
    text: card.promotedTo
      ? copy.reviewSession.toast.levelUp(word)
      : copy.reviewSession.toast.stronger(word),
  };
}

/** Shared capture photo renderer with highlight box. Renders nothing when photo is null. */
export function PhotoLayerView({
  photo,
}: {
  photo: PhotoLayer | null;
}): React.JSX.Element | null {
  const imageUrl = photo?.imageUrl;
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

  if (!photo) {
    return null;
  }

  const { box } = photo;
  const boxStyle = {
    left: `${box.x * 100}%` as const,
    top: `${box.y * 100}%` as const,
    width: `${box.w * 100}%` as const,
    height: `${box.h * 100}%` as const,
  };

  return (
    <View style={base.stackSm}>
      {imageUrl ? (
        <View style={[styles.realPhoto, { aspectRatio: aspect }]}>
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="stretch"
            accessibilityLabel={copy.reviewSession.photoA11y}
          />
          <View style={[styles.highlightBox, boxStyle]} />
        </View>
      ) : (
        <View style={styles.photo}>
          <View style={styles.sign}>
            <Icon
              name="camera"
              size={fontSizes.xl}
              color={colors.hanamaru}
            />
            {(photo.lines ?? []).map((line, i) =>
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
            <View style={[styles.highlightBox, boxStyle]} />
          </View>
        </View>
      )}
      <IconLabel icon="pin" style={base.caption}>
        {photo.caption}
      </IconLabel>
    </View>
  );
}

/** The area where the Tango was saved, as a short label. */
function placeLabel(placeHint: string): string {
  return placeHint || copy.reviewSession.noPlace;
}

/** Where the Tango was saved, once the hint (lightbulb) button is pressed. */
function PlaceCue({
  placeHint,
  showPlace,
}: {
  placeHint: string;
  showPlace: boolean;
}): React.JSX.Element | null {
  return showPlace ? (
    <View style={styles.centerRow}>
      <IconLabel icon="pin" style={base.caption}>
        {placeLabel(placeHint)}
      </IconLabel>
    </View>
  ) : null;
}

function Flashcard({
  exercise,
  index,
  total,
  showPlace,
  onRate,
}: {
  exercise: FlashcardExercise;
  index: number;
  total: number;
  showPlace: boolean;
  onRate: (rating: 'again' | 'good' | 'easy') => void;
}): React.JSX.Element {
  const [flipped, setFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  const flip = () => {
    if (flipped) {
      return;
    }
    setFlipped(true);
    Animated.timing(flipAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={base.stack}>
      <Text style={base.label}>
        {QUESTION_TYPE_LABEL[exercise.questionType]} · {index + 1} of {total}
      </Text>
      <PhotoLayerView photo={exercise.photo} />

      {!flipped ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.reviewSession.flipA11y}
          onPress={flip}
        >
          <Card>
            <View style={styles.prompt}>
              {exercise.front ? (
                <>
                  <Jp
                    text={exercise.front.text}
                    size="jumbo"
                    bold
                    alwaysKanji
                  />
                  <Text style={base.caption}>
                    {copy.reviewSession.flashcardTextPrompt}
                  </Text>
                </>
              ) : (
                <Text style={base.heading}>
                  {copy.reviewSession.flashcardObjectPrompt}
                </Text>
              )}
              <Text style={styles.link}>{copy.reviewSession.tapToFlip}</Text>
            </View>
          </Card>
        </Pressable>
      ) : (
        <Animated.View style={{ opacity: flipAnim }}>
          <Card>
            <View style={styles.prompt}>
              <View style={base.row}>
                <Jp
                  text={exercise.back.text}
                  reading={exercise.back.reading}
                  romaji={exercise.back.romaji}
                  size="jumbo"
                  bold
                />
                <IconButton
                  icon="play"
                  label={copy.common.play(exercise.back.text)}
                  onPress={() => playWord(exercise.back.text)}
                />
              </View>
              {exercise.back.reading &&
              exercise.back.reading !== exercise.back.text ? (
                <Text style={base.text}>{exercise.back.reading}</Text>
              ) : null}
              {exercise.back.romaji ? (
                <Text style={base.caption}>{exercise.back.romaji}</Text>
              ) : null}
              <Text style={styles.meaningPrompt}>{exercise.back.meaning}</Text>
            </View>
            {exercise.back.example ? (
              <View style={styles.example}>
                <Jp
                  text={exercise.back.example.text}
                  reading={exercise.back.example.reading}
                  romaji={exercise.back.example.romaji}
                />
                <Text style={base.caption}>{exercise.back.example.en}</Text>
              </View>
            ) : null}
          </Card>
        </Animated.View>
      )}

      {!flipped ? (
        <Button
          label={copy.reviewSession.flip}
          variant="secondary"
          onPress={flip}
        />
      ) : (
        <View style={base.stackSm}>
          <Text style={[base.caption, styles.center]}>
            {copy.reviewSession.howWell}
          </Text>
          <View style={base.row}>
            <Button
              label={copy.reviewSession.again}
              variant="secondary"
              style={base.grow}
              onPress={() => onRate('again')}
            />
            <Button
              label={copy.reviewSession.good}
              variant="primary"
              style={base.grow}
              onPress={() => onRate('good')}
            />
            <Button
              label={copy.reviewSession.easy}
              variant="dark"
              style={base.grow}
              onPress={() => onRate('easy')}
            />
          </View>
        </View>
      )}

      <PlaceCue placeHint={exercise.placeHint} showPlace={showPlace} />
    </View>
  );
}

function mcqHeading(exercise: McqExercise): string {
  switch (exercise.questionType) {
    case 'mcq_text_reading':
      return copy.reviewSession.mcqHeading.reading;
    case 'mcq_text_translate':
      return exercise.promptKind === 'photo'
        ? copy.reviewSession.mcqHeading.translatePhoto
        : copy.reviewSession.mcqHeading.translate;
    case 'mcq_text_reverse':
      return copy.reviewSession.mcqHeading.reverse;
    case 'mcq_object_name':
      return copy.reviewSession.mcqHeading.objectName;
  }
}

function Mcq({
  exercise,
  index,
  total,
  showPlace,
  onPick,
}: {
  exercise: McqExercise;
  index: number;
  total: number;
  showPlace: boolean;
  onPick: (option: number) => void;
}): React.JSX.Element {
  return (
    <View style={base.stack}>
      <Text style={base.label}>
        {QUESTION_TYPE_LABEL[exercise.questionType]} · {index + 1} of {total}
      </Text>
      <PhotoLayerView photo={exercise.photo} />

      <View style={styles.prompt}>
        {exercise.promptKind === 'jp' ? (
          <Jp
            text={exercise.prompt.text}
            reading={
              exercise.questionType === 'mcq_text_reading'
                ? undefined
                : exercise.prompt.reading
            }
            romaji={
              exercise.questionType === 'mcq_text_reading'
                ? undefined
                : exercise.prompt.romaji
            }
            size="jumbo"
            bold
            alwaysKanji={exercise.questionType === 'mcq_text_reading'}
          />
        ) : exercise.promptKind === 'meaning' ? (
          <Text style={styles.meaningPrompt}>{exercise.meaningPrompt}</Text>
        ) : null}
        <Text style={base.caption}>{mcqHeading(exercise)}</Text>
      </View>

      {exercise.options.map((option, i) => {
        const isJp = typeof option !== 'string';
        const key = isJp ? `${option.text}-${i}` : `${option}-${i}`;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={() => onPick(i)}
            style={styles.option}
          >
            {isJp ? (
              <Jp {...(option as JpText)} size="lg" alwaysKanji />
            ) : (
              <Text style={base.text}>{option}</Text>
            )}
          </Pressable>
        );
      })}

      <PlaceCue placeHint={exercise.placeHint} showPlace={showPlace} />
    </View>
  );
}

/** What to type; read out by screen readers as the input's label. */
function fillInstruction(exercise: FillBlankExercise): string {
  return copy.reviewSession.fillInstruction[exercise.questionType];
}

function FillBlank({
  exercise,
  index,
  total,
  showPlace,
  onAnswer,
}: {
  exercise: FillBlankExercise;
  index: number;
  total: number;
  showPlace: boolean;
  onAnswer: (correct: boolean, typedAnswer?: string) => void;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const [kanaWarning, setKanaWarning] = useState(false);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (
      exercise.questionType === 'fill_text_reading' &&
      hasNonKanaForReading(trimmed)
    ) {
      setKanaWarning(true);
      return;
    }
    setKanaWarning(false);
    const ok = checkFillAnswer(
      trimmed,
      exercise.acceptedAnswers,
      exercise.answerKind,
      exercise.questionType,
    );
    onAnswer(ok, trimmed);
  };

  return (
    <View style={base.stack}>
      <Text style={base.label}>
        {QUESTION_TYPE_LABEL[exercise.questionType]} · {index + 1} of {total}
      </Text>
      <PhotoLayerView photo={exercise.photo} />

      <View style={styles.prompt}>
        {exercise.questionType === 'fill_text_reading' ? (
          <Jp
            text={exercise.prompt.text}
            size="jumbo"
            bold
            alwaysKanji
          />
        ) : exercise.questionType === 'fill_text_translate' ? (
          <Jp {...exercise.prompt} size="jumbo" bold />
        ) : exercise.questionType === 'fill_text_reverse' ? (
          <Text style={styles.meaningPrompt}>{exercise.meaningPrompt}</Text>
        ) : null}
      </View>

      {exercise.cloze ? (
        <View style={styles.example}>
          <Jp
            text={exercise.cloze.text}
            reading={
              exercise.questionType === 'fill_text_reading'
                ? undefined
                : exercise.cloze.reading
            }
            alwaysKanji={exercise.questionType === 'fill_text_reading'}
          />
          <Text style={base.caption}>{exercise.cloze.en}</Text>
        </View>
      ) : null}

      <View style={base.stackSm}>
        <TextInput
          value={text}
          onChangeText={val => {
            setText(val);
            if (kanaWarning) {
              setKanaWarning(false);
            }
          }}
          placeholder={copy.reviewSession.typePlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={submit}
          style={styles.input}
          accessibilityLabel={fillInstruction(exercise)}
        />
        {exercise.answerKind === 'kana' ? (
          <Text style={base.caption}>
            {exercise.questionType === 'fill_text_reading'
              ? copy.reviewSession.keyboardKana
              : copy.reviewSession.keyboardKanjiOrKana}
          </Text>
        ) : null}
        {kanaWarning ? (
          <Text style={styles.kanaWarning} accessibilityRole="alert">
            {copy.reviewSession.answerInKana}
          </Text>
        ) : null}
      </View>

      <View style={base.row}>
        <Button
          label={copy.reviewSession.showAnswer}
          variant="secondary"
          style={base.grow}
          onPress={() => onAnswer(false)}
        />
        <Button
          label={copy.reviewSession.check}
          variant="primary"
          style={base.grow}
          disabled={!text.trim()}
          onPress={submit}
        />
      </View>

      <PlaceCue placeHint={exercise.placeHint} showPlace={showPlace} />
    </View>
  );
}

function answerTextFor(exercise: Exercise): string {
  if (exercise.type === 'flashcard') {
    return copy.reviewSession.flashcardAnswer(
      exercise.back.text,
      exercise.back.reading,
      exercise.back.meaning,
    );
  }
  if (exercise.type === 'mcq') {
    const right = exercise.options[exercise.answerIndex];
    return typeof right === 'string' ? right : right.text;
  }
  return exercise.answerDisplay;
}

function Feedback({
  exercise,
  correct,
  revealed,
  stale,
}: {
  exercise: Exercise;
  correct: boolean;
  revealed: boolean;
  stale: boolean;
}): React.JSX.Element {
  const answer = answerTextFor(exercise);
  // A stale answer wasn't counted, so the stage didn't change.
  const stageChange = stale
    ? null
    : correct
    ? exercise.promotedTo
    : exercise.demotedTo;
  const wordJp: JpText =
    exercise.type === 'flashcard'
      ? {
          text: exercise.back.text,
          reading: exercise.back.reading,
          romaji: exercise.back.romaji,
        }
      : exercise.prompt;
  const meaning =
    exercise.type === 'flashcard'
      ? exercise.back.meaning
      : exercise.meaningPrompt;
  const example =
    exercise.type === 'flashcard' ? exercise.back.example : exercise.example;
  const synonyms =
    exercise.type === 'fill' &&
    exercise.questionType === 'fill_text_translate' &&
    exercise.acceptedAnswers.length > 1
      ? exercise.acceptedAnswers.slice(1).join(', ')
      : '';

  return (
    <View style={base.stack}>
      <View style={styles.prompt}>
        {revealed ? (
          <>
            <Text style={[styles.verdict, styles.neutral]}>
              {copy.reviewSession.revealed}
            </Text>
            <Text style={styles.revealedAnswer}>{answer}</Text>
          </>
        ) : (
          <>
            <View style={[styles.badge, !correct && styles.badgeWrong]}>
              <Icon
                name={correct ? 'done' : 'triangle'}
                size={fontSizes.xxl}
                color={correct ? colors.positive : colors.caution}
              />
            </View>
            <Text style={[styles.verdict, !correct && styles.wrong]}>
              {correct ? copy.reviewSession.correct : copy.reviewSession.wrong}
            </Text>
            {!correct ? (
              <Text style={base.caption}>{copy.reviewSession.theAnswerWas(answer)}</Text>
            ) : null}
          </>
        )}
        {synonyms ? (
          <Text style={base.caption}>{copy.reviewSession.alsoAccepted(synonyms)}</Text>
        ) : null}
        {stale ? (
          <Text style={base.caption} accessibilityRole="alert">
            {copy.reviewSession.stale}
          </Text>
        ) : null}
      </View>

      {stageChange ? (
        <View
          style={[
            styles.stageBanner,
            !correct && styles.stageBannerDemote,
          ]}
        >
          <Text
            style={[
              styles.stageBannerText,
              !correct && styles.stageBannerTextDemote,
            ]}
          >
            {correct ? copy.reviewSession.levelUp : copy.reviewSession.backAStep}
          </Text>
        </View>
      ) : null}

      <Card>
        <View style={base.rowBetween}>
          <View style={base.row}>
            <Jp {...wordJp} size="xl" bold />
            <Text style={base.caption}>
              {[wordJp.reading, meaning].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <IconButton
            icon="play"
            label={copy.common.play(wordJp.text)}
            onPress={() => playWord(wordJp.text)}
          />
        </View>
        {example ? (
          <View style={styles.example}>
            <Jp
              text={example.text ?? ''}
              reading={example.reading}
              romaji={example.romaji}
            />
            <Text style={base.caption}>{example.en}</Text>
          </View>
        ) : null}
        <IconLabel icon="pin" style={base.caption}>
          {placeLabel(exercise.placeHint)}
        </IconLabel>
      </Card>

      {correct && exercise.nextStep ? (
        <Text style={styles.next}>{exercise.nextStep}</Text>
      ) : null}
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
              <Text style={styles.verdict}>{copy.sessionResults.excellent}</Text>
              <Text style={base.caption}>
                {copy.sessionResults.summary(r.reviewed, r.minutes)}
              </Text>
            </View>

            {r.biggestWin ? (
              <>
                <Text style={styles.eyebrow}>
                  {copy.sessionResults.biggestWin}
                </Text>
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
                <Text style={base.heading}>
                  {copy.sessionResults.practiced}
                </Text>
                {r.byArea.map(row => (
                  <View key={row.area} style={base.rowBetween}>
                    <Text style={base.text}>{row.area}</Text>
                    <Text style={styles.strong}>
                      {copy.sessionResults.tangoCount(row.count)}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {r.next ? (
              <Card variant="soft">
                <IconLabel icon="calendar" style={base.text}>
                  {copy.sessionResults.next(
                    r.next.place.name.text,
                    r.next.place.name.meaning,
                    formatVisitTime(r.next.when),
                  )}
                </IconLabel>
              </Card>
            ) : null}
          </ScrollView>
          <View style={[base.row, styles.footer]}>
            <Button
              label={copy.sessionResults.backToToday}
              variant="secondary"
              style={base.grow}
              onPress={() => {
                navigation.popToTop();
                navigation.navigate('Tabs', { screen: 'Today' });
              }}
            />
            {r.next ? (
              <Button
                label={copy.sessionResults.prepareNext}
                style={base.grow}
                onPress={() =>
                  r.next &&
                  navigation.replace('Prepare', { placeId: r.next.place.id })
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
  toastSlot: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
  },
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
  meaningPrompt: {
    ...base.title,
    textAlign: 'center',
  },
  option: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    padding: space.lg,
  },
  input: {
    ...base.text,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: fontSizes.lg,
  },
  kanaWarning: {
    ...base.caption,
    color: colors.caution,
    fontWeight: fontWeights.bold,
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
  highlightBox: {
    position: 'absolute',
    borderWidth: sizes.border,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
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
  revealedAnswer: {
    ...base.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  verdict: {
    ...base.title,
    color: colors.positive,
  },
  wrong: {
    color: colors.caution,
  },
  neutral: {
    color: colors.text,
  },
  stageBanner: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: space.md,
    alignItems: 'center',
  },
  stageBannerDemote: {
    backgroundColor: colors.surfaceMuted,
  },
  stageBannerText: {
    ...base.text,
    color: colors.accent,
    fontWeight: fontWeights.bold,
  },
  stageBannerTextDemote: {
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
