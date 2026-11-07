import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { startRehearsal } from '../../api/rehearse';
import { Jp } from '../../components/Jp';
import { ScreenHeader } from '../../components/layout';
import { Button, Loadable, SegmentedControl } from '../../components/ui';
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
import type { RehearsalScript, RehearsalTurn } from '../../types';

const STAFF_DELAY_MS = { slower: 1400, natural: 700 } as const;

export function RehearseScreen({
  route,
  navigation,
}: RootScreenProps<'Rehearse'>): React.JSX.Element {
  const { placeId } = route.params;
  const { settings } = useSettings();
  const [speed, setSpeed] = useState(settings.staffSpeed);
  // The script doesn't depend on speed in the mock, so load it once per place.
  const script = useAsync(() => startRehearsal(placeId, settings.staffSpeed), placeId);

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
              navigation.replace('RehearseResults', { placeId, hintsUsed })
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
  const [hintOpen, setHintOpen] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const next = turns[shown] as RehearsalTurn | undefined;
  const userTurnNow = next?.speaker === 'user';
  const finished = shown >= turns.length;

  // Staff replies arrive on their own after a short pause.
  useEffect(() => {
    if (next?.speaker !== 'staff') {
      return;
    }
    const timer = setTimeout(() => setShown(n => n + 1), STAFF_DELAY_MS[speed]);
    return () => clearTimeout(timer);
  }, [next, speed]);

  const answer = () => {
    if (!userTurnNow) {
      return;
    }
    setHintOpen(false);
    setShown(n => n + 1);
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
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {turns.slice(0, shown).map((turn, index) =>
          turn.speaker === 'staff' ? (
            <View key={turn.id} style={styles.staffBlock}>
              <Text style={styles.eyebrow}>✦ STAFF · AI</Text>
              <Pressable
                style={styles.staffBubble}
                onPress={() => setRevealed(r => ({ ...r, [turn.id]: true }))}
                accessibilityHint="Tap to see English"
              >
                <Jp {...turn.jp} size="lg" />
                {englishVisible(turn, index) ? (
                  <Text style={base.caption}>{turn.en}</Text>
                ) : (
                  <Text style={styles.tapChip}>Tap to see English</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View key={turn.id} style={styles.userBlock}>
              <Text style={base.label}>You</Text>
              <View style={styles.userBubble}>
                <Jp {...turn.jp} size="lg" tone="inverse" />
              </View>
              {turn.naturalness ? (
                <Text
                  style={[
                    styles.naturalness,
                    !turn.naturalness.ok && styles.naturalnessWarn,
                  ]}
                >
                  {turn.naturalness.ok ? '✓' : '!'} {turn.naturalness.label}
                </Text>
              ) : null}
            </View>
          ),
        )}

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
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bottom}>
        {finished ? (
          <Button label="See results" onPress={() => onFinish(hintsUsed)} />
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hold to speak"
              disabled={!userTurnNow}
              onPressIn={() => setListening(true)}
              onPressOut={() => {
                setListening(false);
                answer();
              }}
              style={[
                styles.mic,
                listening && styles.micListening,
                !userTurnNow && styles.micDisabled,
              ]}
            >
              <Text style={styles.micGlyph}>🎙</Text>
            </Pressable>
            <Text style={base.caption}>
              {listening
                ? 'Listening… release to send (no real audio yet)'
                : 'Hold to speak · tap a line to see English'}
            </Text>
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
