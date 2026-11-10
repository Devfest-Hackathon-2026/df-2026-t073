import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  answerTurn,
  getStaffAudio,
  type ReplyInput,
  startRehearsal,
} from '../../api/rehearse';
import {
  playUrl,
  requestMicPermission,
  startRecording,
  stopPlaying,
  stopRecording,
} from '../../audio/audio';
import { Icon } from '../../components/Icon';
import { Jp } from '../../components/Jp';
import { ScreenHeader } from '../../components/layout';
import {
  Button,
  Chip,
  IconButton,
  IconLabel,
  Loadable,
  ProgressBar,
  SegmentedControl,
} from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { RootScreenProps } from '../../navigation/types';
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
import type { RehearsalScript, RehearsalTurn, TurnAnswer } from '../../types';
import { copy } from '../../copy';

/** Shown while loading: build anticipation, not impatience. */
const REHEARSE_LINES = copy.rehearse.loadingLines;

const STAFF_DELAY_MS = { slower: 1400, natural: 700 } as const;

export function RehearseScreen({
  route,
  navigation,
}: RootScreenProps<'Rehearse'>): React.JSX.Element {
  const { placeId } = route.params;
  const { settings, update } = useSettings();
  const [speed, setSpeed] = useState(settings.staffSpeed);
  // One script per place (cached on the backend); speed only changes the staff voice.
  const script = useAsync(
    () => startRehearsal(placeId, settings.explanationsLanguage),
    placeId,
  );

  return (
    <SafeAreaView style={base.screen}>
      <View style={styles.top}>
        <ScreenHeader onBack={() => navigation.goBack()} close>
          <IconLabel icon="ai" style={styles.eyebrow}>
            {copy.rehearse.aiRolePlay}
          </IconLabel>
          {script.data ? (
            <Jp {...script.data.place.name} bold furigana={false} />
          ) : null}
        </ScreenHeader>
        <SegmentedControl
          options={[
            { value: 'slower', label: copy.rehearse.slower },
            { value: 'natural', label: copy.rehearse.natural },
          ]}
          value={speed}
          onChange={setSpeed}
        />
      </View>
      <Loadable state={script} messages={REHEARSE_LINES}>
        {data => (
          <Conversation
            script={data}
            speed={speed}
            onFinish={hintsUsed => {
              // Ticks off the last Getting started step.
              update({ rehearsedOnce: true });
              navigation.replace('RehearseResults', {
                placeId,
                hintsUsed,
                rehearsalId: data.rehearsalId,
              });
            }}
          />
        )}
      </Loadable>
    </SafeAreaView>
  );
}

export function Conversation({
  script,
  speed,
  onFinish,
}: {
  script: RehearsalScript;
  speed: 'slower' | 'natural';
  onFinish: (hintsUsed: number) => void;
}): React.JSX.Element {
  const { settings } = useSettings();
  const turns = script.turns;
  // How many turns are on screen. Starts with the staff's first line.
  const [shown, setShown] = useState(1);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, TurnAnswer>>({});
  const [hintOpen, setHintOpen] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [listening, setListening] = useState(false);
  const [checking, setChecking] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const next = turns[shown] as RehearsalTurn | undefined;
  // The latest reply on screen can be tried again.
  const lastAnswered = [...turns.slice(0, shown)]
    .reverse()
    .find(t => t.speaker === 'user' && answers[t.id]);

  /** Opens a reply again: its answer goes, and lines after it are hidden. */
  const tryAgain = (turn: RehearsalTurn) => {
    setAnswers(a => {
      const rest = { ...a };
      delete rest[turn.id];
      return rest;
    });
    setHintOpen(false);
    setChoosing(false);
    setMessage(null);
    setShown(turns.indexOf(turn));
  };
  // The learner's replies: how many there are and how many are still to come.
  const replies = turns.filter(t => t.speaker === 'user');
  const repliesLeft = replies.filter(t => !answers[t.id]).length;
  const userTurnNow = next?.speaker === 'user';
  const finished = shown >= turns.length;
  const lastShown = turns[shown - 1];

  // Speak each staff line as it appears; the speaker button replays it.
  const speak = useCallback(
    async (turn: RehearsalTurn) => {
      const url = await getStaffAudio(turn.jp.text, speed);
      if (url) {
        await playUrl(url).catch(() => {});
      }
    },
    [speed],
  );
  const lastShownId = lastShown?.id;
  useEffect(() => {
    if (lastShown?.speaker === 'staff') {
      speak(lastShown);
    }
    // Only when a new staff line appears, not when the speed changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastShownId]);
  useEffect(
    () => () => {
      stopPlaying();
    },
    [],
  );

  // Staff replies arrive on their own after a short pause.
  useEffect(() => {
    if (next?.speaker !== 'staff') {
      return;
    }
    const timer = setTimeout(() => setShown(n => n + 1), STAFF_DELAY_MS[speed]);
    return () => clearTimeout(timer);
  }, [next, speed]);

  const record = (turn: RehearsalTurn, result: TurnAnswer) => {
    setAnswers(a => ({ ...a, [turn.id]: result }));
    setHintOpen(false);
    setChoosing(false);
    setMessage(null);
    setShown(n => n + 1);
  };

  const submit = async (reply: ReplyInput) => {
    if (!next || !userTurnNow) {
      return;
    }
    setChecking(true);
    try {
      record(next, await answerTurn(script.rehearsalId, next, reply));
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : copy.rehearse.couldNotCheck,
      );
    } finally {
      setChecking(false);
    }
  };

  const startSpeaking = async () => {
    if (!userTurnNow || checking) {
      return;
    }
    setMessage(null);
    if (!(await requestMicPermission())) {
      setChoosing(true);
      setMessage(copy.rehearse.noMicrophone);
      return;
    }
    try {
      await startRecording();
      setListening(true);
    } catch {
      setChoosing(true);
      setMessage(copy.rehearse.recordingUnavailable);
    }
  };

  const stopSpeaking = async () => {
    if (!listening) {
      return;
    }
    setListening(false);
    try {
      const clip = await stopRecording();
      if (!clip) {
        setMessage(copy.rehearse.holdWhileSpeaking);
        return;
      }
      await submit({ audioBase64: clip.base64, mimeType: clip.mimeType });
    } catch {
      setChoosing(true);
      setMessage(copy.rehearse.recordingFailed);
    }
  };

  const englishVisible = (turn: RehearsalTurn, index: number) => {
    if (revealed[turn.id]) {
      return true;
    }
    // With the setting on, English appears once the line has been answered.
    return settings.englishAfterRoleplayLine && index < shown - 1;
  };

  return (
    <>
      <View style={styles.progress}>
        <View style={base.grow}>
          <ProgressBar
            value={(replies.length - repliesLeft) / Math.max(1, replies.length)}
          />
        </View>
        <Text style={base.caption}>
          {copy.rehearse.repliesLeft(repliesLeft)}
        </Text>
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.chat}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {turns.slice(0, shown).map((turn, index) => {
          if (turn.speaker === 'staff') {
            return (
              <View key={turn.id} style={styles.staffBlock}>
                <IconLabel icon="ai" style={styles.eyebrow}>
                  {copy.rehearse.staffAi}
                </IconLabel>
                <View style={styles.staffRow}>
                  <Pressable
                    style={styles.staffBubble}
                    onPress={() =>
                      setRevealed(r => ({ ...r, [turn.id]: true }))
                    }
                    accessibilityHint={copy.rehearse.tapForEnglish}
                  >
                    <Jp {...turn.jp} size="lg" />
                    {englishVisible(turn, index) ? (
                      <Text style={base.caption}>{turn.en}</Text>
                    ) : (
                      <Text style={styles.tapChip}>
                        {copy.rehearse.tapForEnglish}
                      </Text>
                    )}
                  </Pressable>
                  <IconButton
                    icon="play"
                    label={copy.rehearse.playAgain}
                    onPress={() => speak(turn)}
                  />
                </View>
              </View>
            );
          }
          const said = answers[turn.id];
          return (
            <View key={turn.id} style={styles.userBlock}>
              <View style={styles.youRow}>
                <Text style={base.label}>{copy.rehearse.you}</Text>
                {said?.spoken ? (
                  <Chip label={copy.rehearse.spoken} tone="outline" />
                ) : null}
              </View>
              <View style={styles.userBubble}>
                <Jp {...(said?.said ?? turn.jp)} size="lg" tone="inverse" />
              </View>
              {said ? (
                <View style={styles.naturalnessRow}>
                  <Icon
                    name={said.ok ? 'done' : 'triangle'}
                    size={fontSizes.sm}
                    color={said.ok ? colors.positive : colors.caution}
                  />
                  <Text
                    style={[
                      styles.naturalness,
                      !said.ok && styles.naturalnessWarn,
                    ]}
                  >
                    {said.label}
                  </Text>
                </View>
              ) : null}
              {said && turn.id === lastAnswered?.id && !checking ? (
                <Text
                  accessibilityRole="button"
                  style={styles.tryAgain}
                  onPress={() => tryAgain(turn)}
                >
                  {copy.rehearse.tryAgain}
                </Text>
              ) : null}
            </View>
          );
        })}

        {userTurnNow && next ? (
          <View style={styles.userBlock}>
            {/* What to say next, in English: a guide, not a test. */}
            <View style={styles.goal}>
              <Text style={styles.eyebrow}>{copy.rehearse.yourTurn}</Text>
              <Text style={base.caption}>{copy.rehearse.sayNext}</Text>
              <Text style={styles.goalText}>“{next.en}”</Text>
            </View>
            {hintOpen && next.hint ? (
              <View style={styles.hint}>
                <IconLabel icon="hint" style={styles.eyebrow}>
                  {copy.rehearse.hint}
                </IconLabel>
                <Text style={base.caption}>{next.hint.explanation}</Text>
                <Jp {...next.hint.model} size="lg" bold />
                <Text style={base.caption}>{next.hint.modelEn}</Text>
              </View>
            ) : (
              <Pressable
                style={styles.hintButton}
                onPress={() => {
                  setHintOpen(true);
                  setHintsUsed(n => n + 1);
                }}
              >
                <Text style={styles.hintButtonText}>
                  {copy.rehearse.needHint}
                </Text>
              </Pressable>
            )}
            {choosing && next.choices?.length ? (
              <View style={styles.choices}>
                {next.choices.map((choice, i) => (
                  <Pressable
                    key={choice.jp.text}
                    accessibilityRole="button"
                    disabled={checking}
                    onPress={() => submit({ choiceIndex: i })}
                    style={styles.choice}
                  >
                    <Jp {...choice.jp} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bottom}>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {finished ? (
          <Button
            label={copy.rehearse.seeResults}
            onPress={() => onFinish(hintsUsed)}
          />
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.rehearse.holdToSpeak}
              disabled={!userTurnNow || checking}
              onPressIn={startSpeaking}
              onPressOut={stopSpeaking}
              style={[
                styles.mic,
                listening && styles.micListening,
                (!userTurnNow || checking) && styles.micDisabled,
              ]}
            >
              <Icon
                name="mic"
                size={fontSizes.xxl}
                color={colors.textInverse}
              />
            </Pressable>
            <Text style={base.caption}>
              {checking
                ? copy.rehearse.checking
                : listening
                ? copy.rehearse.listening
                : copy.rehearse.holdToSpeak}
            </Text>
            {userTurnNow && !choosing ? (
              <Text
                accessibilityRole="button"
                style={styles.chooseLink}
                onPress={() => setChoosing(true)}
              >
                {copy.rehearse.chooseReply}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  top: {
    padding: space.lg,
    gap: space.md,
  },
  eyebrow: {
    ...base.label,
    color: colors.accent,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  goal: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.md,
    gap: space.xxs,
  },
  goalText: {
    ...base.text,
    fontWeight: fontWeights.bold,
  },
  chat: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  staffBlock: {
    alignItems: 'flex-start',
    gap: space.xs,
  },
  youRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: space.xs,
  },
  staffBubble: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.md,
    gap: space.xs,
    maxWidth: '85%',
  },
  tapChip: {
    ...base.caption,
    alignSelf: 'flex-start',
    fontWeight: fontWeights.bold,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: space.sm,
  },
  userBlock: {
    alignItems: 'flex-end',
    gap: space.xs,
  },
  userBubble: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    padding: space.md,
    maxWidth: '85%',
  },
  naturalnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  tryAgain: {
    ...base.caption,
    padding: space.xs,
  },
  naturalness: {
    ...base.caption,
    color: colors.positive,
  },
  naturalnessWarn: {
    color: colors.caution,
  },
  hint: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    borderWidth: sizes.hairline,
    borderColor: colors.accent,
    padding: space.md,
    gap: space.xs,
    maxWidth: '85%',
  },
  hintButton: {
    borderWidth: sizes.hairline,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.button,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  hintButtonText: {
    ...base.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  choices: {
    alignSelf: 'stretch',
    gap: space.sm,
  },
  choice: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: sizes.hairline,
    borderColor: colors.border,
    padding: space.md,
  },
  chooseLink: {
    ...base.caption,
    color: colors.accent,
    fontWeight: fontWeights.bold,
    padding: space.xs,
  },
  message: {
    ...base.caption,
    color: colors.caution,
    textAlign: 'center',
  },
  bottom: {
    alignItems: 'center',
    gap: space.sm,
    padding: space.lg,
  },
  mic: {
    width: sizes.mic,
    height: sizes.mic,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micListening: {
    borderWidth: space.xs,
    borderColor: colors.accentSoft,
  },
  micDisabled: {
    backgroundColor: colors.border,
  },
});
