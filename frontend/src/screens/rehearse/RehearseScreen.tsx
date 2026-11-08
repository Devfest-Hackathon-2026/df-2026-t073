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
import { Jp } from '../../components/Jp';
import { ScreenHeader } from '../../components/layout';
import {
  Button,
  IconButton,
  Loadable,
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

const STAFF_DELAY_MS = { slower: 1400, natural: 700 } as const;

export function RehearseScreen({
  route,
  navigation,
}: RootScreenProps<'Rehearse'>): React.JSX.Element {
  const { placeId } = route.params;
  const { settings } = useSettings();
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
          <Text style={styles.eyebrow}>✦ AI role-play</Text>
          {script.data ? <Jp {...script.data.place.name} bold /> : null}
          <Text style={base.caption}>⤨ New staff voice each time</Text>
        </ScreenHeader>
        <SegmentedControl
          options={[
            { value: 'slower', label: 'Slower' },
            { value: 'natural', label: 'Natural' },
          ]}
          value={speed}
          onChange={setSpeed}
        />
      </View>
      <Loadable state={script}>
        {data => (
          <Conversation
            script={data}
            speed={speed}
            onFinish={hintsUsed =>
              navigation.replace('RehearseResults', {
                placeId,
                hintsUsed,
                rehearsalId: data.rehearsalId,
              })
            }
          />
        )}
      </Loadable>
    </SafeAreaView>
  );
}

function Conversation({
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
        err instanceof Error ? err.message : 'Could not check that reply.',
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
      setMessage('No microphone access, so choose a reply instead.');
      return;
    }
    try {
      await startRecording();
      setListening(true);
    } catch {
      setChoosing(true);
      setMessage('Recording is not available here. Choose a reply instead.');
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
        setMessage('Hold the button while you speak.');
        return;
      }
      await submit({ audioBase64: clip.base64, mimeType: clip.mimeType });
    } catch {
      setChoosing(true);
      setMessage('Recording failed. Choose a reply instead.');
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
                <Text style={styles.eyebrow}>✦ STAFF · AI</Text>
                <View style={styles.staffRow}>
                  <Pressable
                    style={styles.staffBubble}
                    onPress={() =>
                      setRevealed(r => ({ ...r, [turn.id]: true }))
                    }
                    accessibilityHint="Tap to see English"
                  >
                    <Jp {...turn.jp} size="lg" />
                    {englishVisible(turn, index) ? (
                      <Text style={base.caption}>{turn.en}</Text>
                    ) : (
                      <Text style={styles.tapChip}>Tap to see English</Text>
                    )}
                  </Pressable>
                  <IconButton
                    glyph="🔈"
                    label="Play again"
                    onPress={() => speak(turn)}
                  />
                </View>
              </View>
            );
          }
          const said = answers[turn.id];
          return (
            <View key={turn.id} style={styles.userBlock}>
              <Text style={base.label}>
                You{said?.spoken ? ' · spoken' : ''}
              </Text>
              <View style={styles.userBubble}>
                <Jp {...(said?.said ?? turn.jp)} size="lg" tone="inverse" />
              </View>
              {said ? (
                <Text
                  style={[
                    styles.naturalness,
                    !said.ok && styles.naturalnessWarn,
                  ]}
                >
                  {said.ok ? '✓' : '!'} {said.label}
                </Text>
              ) : null}
            </View>
          );
        })}

        {userTurnNow && next ? (
          <View style={styles.userBlock}>
            <Text style={base.caption}>Your turn</Text>
            {hintOpen && next.hint ? (
              <View style={styles.hint}>
                <Text style={styles.eyebrow}>✦ Hint</Text>
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
                <Text style={styles.hintButtonText}>Need a hint?</Text>
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
          <Button label="See results" onPress={() => onFinish(hintsUsed)} />
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hold to speak"
              disabled={!userTurnNow || checking}
              onPressIn={startSpeaking}
              onPressOut={stopSpeaking}
              style={[
                styles.mic,
                listening && styles.micListening,
                (!userTurnNow || checking) && styles.micDisabled,
              ]}
            >
              <Text style={styles.micGlyph}>🎙</Text>
            </Pressable>
            <Text style={base.caption}>
              {checking
                ? 'Checking your reply…'
                : listening
                ? 'Listening… release to send'
                : 'Hold to speak · tap a line to see English'}
            </Text>
            {userTurnNow && !choosing ? (
              <Text
                accessibilityRole="button"
                style={styles.chooseLink}
                onPress={() => setChoosing(true)}
              >
                {"Can't speak right now? Choose a reply"}
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
  chat: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  staffBlock: {
    alignItems: 'flex-start',
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
    borderRadius: radii.pill,
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
  micGlyph: {
    fontSize: fontSizes.xl,
    color: colors.textInverse,
  },
});
