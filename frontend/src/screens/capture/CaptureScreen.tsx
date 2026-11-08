import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { fromByteArray } from 'base64-js';
import {
  catchTango,
  getCurrentPlaceName,
  getTodaysCatch,
  readSelection,
  recordRecognition,
  undoCatch,
  type UndoTarget,
  uploadCapture,
} from '../../api/capture';
import { isLive } from '../../config';
import { getTango } from '../../api/tango';
import { Jp } from '../../components/Jp';
import { BottomSheet, Toast } from '../../components/layout';
import {
  Button,
  Chip,
  IconButton,
  SegmentedControl,
} from '../../components/ui';
import {
  boxOf,
  type DetectorFrame,
  type DetectorMode,
  EMPTY_FRAME,
  mockDetector,
} from '../../features/capture/detector';
import { SelectionBox } from '../../features/capture/SelectionBox';
import { PLACEHOLDER_PHOTO_LINES } from '../../mocks/capture';
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
import type {
  DetectedItem,
  Detection,
  JpText,
  NormalizedBox,
  SelectionReading,
  Tango,
} from '../../types';
import { orderExamples } from '../../utils/format';

type Phase = 'live' | 'caught' | 'frozen';

type Sheet =
  | { kind: 'tango'; tango: Tango; detection: Detection }
  | { kind: 'known'; tango: Tango }
  | { kind: 'reading'; reading: SelectionReading }
  | { kind: 'found' }
  | null;

/** A backend read of one photo (POST /api/v1/captures). */
interface Found {
  captureId: string;
  items: DetectedItem[];
}

interface ToastState {
  jp?: JpText;
  text: string;
  undo?: UndoTarget & {
    itemId?: string;
    /** Undoing a new card takes one off today's count; a repeat catch does not. */
    created: boolean;
  };
}

const FILL = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

const DEFAULT_BOX: NormalizedBox = { x: 0.2, y: 0.32, w: 0.6, h: 0.14 };
const CAUGHT_MS = 900;
/** Upload size: enough for small sign text, well under the backend's 10 MiB limit. */
const PHOTO_SIZE = { width: 1600, height: 1200 };
const LIVE_HINT = "Press the shutter to read what's in front of you.";
const TOAST_MS = 4000;

/** A Tango-shaped stand-in for detections that aren't saved Tango yet. */
function tangoFromDetection(d: Detection): Tango {
  return {
    id: d.tangoId ?? d.item_id,
    kind: d.item_type === 'object' ? 'object' : 'word',
    text: d.japanese_text,
    reading: d.reading ?? '',
    romaji: '',
    meaning: d.english_gloss ?? '',
    sightings: [],
    strength: 0,
    known: false,
    history: [],
    examples: [],
  };
}

export function CaptureScreen({
  navigation,
}: RootScreenProps<'Capture'>): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { settings } = useSettings();

  // Camera
  const device = useCameraDevice('back');
  const permission = useCameraPermission();
  const photoOutput = usePhotoOutput({
    targetResolution: PHOTO_SIZE,
    containerFormat: 'jpeg',
    quality: 0.8,
  });
  // Live: real photo reads on the backend. Mock: scripted detector (src/mocks).
  const live = isLive('capture');
  const outputs = useMemo(() => [photoOutput], [photoOutput]);
  const cameraReady = !!device && permission.hasPermission;
  const { canRequestPermission, requestPermission } = permission;
  useEffect(() => {
    if (canRequestPermission) {
      requestPermission();
    }
  }, [canRequestPermission, requestPermission]);

  // Screen state
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<DetectorMode>('text');
  const [frame, setFrame] = useState<DetectorFrame>(EMPTY_FRAME);
  const [phase, setPhase] = useState<Phase>('live');
  const [placeName, setPlaceName] = useState('Finding your place…');
  const [count, setCount] = useState(0);
  const [caught, setCaught] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [frozenUri, setFrozenUri] = useState<string | null>(null);
  const [box, setBox] = useState<NormalizedBox>(DEFAULT_BOX);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    getCurrentPlaceName()
      .then(setPlaceName)
      .catch(() => setPlaceName('Unknown place'));
    getTodaysCatch()
      .then(list => setCount(list.length))
      .catch(() => {});
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Mock detection runs while the camera is live. Real on-device detection
  // (ML Kit) plugs in here later; in live mode the shutter does the reading.
  useEffect(() => {
    if (phase === 'frozen' || live) {
      return;
    }
    return mockDetector.start(mode, setFrame);
  }, [mode, phase, live]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const centered = frame.items.find(
    item =>
      item.item_id === frame.centeredId && !caught[item.item_id] && !item.known,
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const showError = (err: unknown) =>
    setError(err instanceof Error ? err.message : 'Something went wrong');

  const doCatch = async (detection: Detection) => {
    setPhase('caught');
    try {
      const { tango, created, sightingId } = await catchTango({
        detection,
        placeName,
      });
      setCaught(ids => ({ ...ids, [detection.item_id]: true }));
      if (created) {
        setCount(n => n + 1);
      }
      later(() => {
        setPhase('live');
        setToast({
          jp: tango,
          text: created ? 'caught here' : 'seen again, added here',
          undo: {
            tangoId: tango.id,
            sightingId,
            itemId: detection.item_id,
            created,
          },
        });
      }, CAUGHT_MS);
    } catch (err) {
      setPhase('live');
      showError(err);
    }
  };

  const catchFromReading = async (reading: SelectionReading) => {
    setSheet(null);
    try {
      const { tango, created, sightingId } = await catchTango({
        tangoId: reading.tango.id,
        placeName,
      });
      if (created) {
        setCount(n => n + 1);
      }
      setToast({
        jp: tango,
        text: created ? 'saved, pinned here' : 'seen again, added here',
        undo: { tangoId: tango.id, sightingId, created },
      });
      unfreeze();
    } catch (err) {
      showError(err);
    }
  };

  const undo = async (target: NonNullable<ToastState['undo']>) => {
    setToast(null);
    try {
      await undoCatch({
        tangoId: target.tangoId,
        sightingId: target.sightingId,
      });
      if (target.created) {
        setCount(n => Math.max(0, n - 1));
      }
      if (target.itemId) {
        const itemId = target.itemId;
        setCaught(ids => ({ ...ids, [itemId]: false }));
      }
    } catch (err) {
      showError(err);
    }
  };

  const openDetection = async (detection: Detection) => {
    try {
      const tango = detection.tangoId
        ? await getTango(detection.tangoId)
        : tangoFromDetection(detection);
      setSheet(
        detection.known
          ? { kind: 'known', tango }
          : { kind: 'tango', tango, detection },
      );
    } catch (err) {
      showError(err);
    }
  };

  const freeze = (uri: string | null) => {
    setFrozenUri(uri);
    setBox(DEFAULT_BOX);
    setFrame(EMPTY_FRAME);
    setPhase('frozen');
  };

  const unfreeze = () => {
    setFrozenUri(null);
    setFound(null);
    setSheet(null);
    setPhase('live');
  };

  /** Sends a photo to the backend and lists what it found. */
  const readPhoto = async (base64: string, mimeType: string) => {
    setError(null);
    // Item IDs repeat across photos, so "saved" marks belong to one photo only.
    setCaught({});
    setBusy(true);
    try {
      const result = await uploadCapture(base64, mimeType);
      setFound({ captureId: result.capture_id, items: result.detected_items });
      setSheet({ kind: 'found' });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const catchFound = async (item: DetectedItem) => {
    if (!found) {
      return;
    }
    setError(null);
    setSaving(item.item_id);
    try {
      const { tango, created, sightingId } = await catchTango({
        detection: { ...item, known: false },
        captureId: found.captureId,
        placeName,
      });
      setCaught(ids => ({ ...ids, [item.item_id]: true }));
      if (created) {
        setCount(n => n + 1);
      }
      setToast({
        jp: tango,
        text: created ? 'caught here' : 'seen again, added here',
        undo: { tangoId: tango.id, sightingId, itemId: item.item_id, created },
      });
    } catch (err) {
      showError(err);
    } finally {
      setSaving(null);
    }
  };

  const onShutterLive = async () => {
    if (!cameraReady) {
      setError('No camera available. Use the photo import button instead.');
      return;
    }
    try {
      const photo = await photoOutput.capturePhoto({}, {});
      try {
        const path = await photo.saveToTemporaryFileAsync();
        const bytes = await photo.getFileDataAsync();
        freeze(path.startsWith('file://') ? path : `file://${path}`);
        await readPhoto(fromByteArray(new Uint8Array(bytes)), 'image/jpeg');
      } finally {
        photo.dispose();
      }
    } catch (err) {
      showError(err);
    }
  };

  const onShutter = async () => {
    if (live) {
      await onShutterLive();
      return;
    }
    let uri: string | null = null;
    if (cameraReady) {
      try {
        const file = await photoOutput.capturePhotoToFile({}, {});
        uri = `file://${file.filePath}`;
      } catch {
        uri = null;
      }
    }
    freeze(uri);
  };

  const onImport = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: live,
        maxWidth: PHOTO_SIZE.width,
        maxHeight: PHOTO_SIZE.width,
        quality: 0.8,
      });
      if (result.didCancel) {
        return;
      }
      if (result.errorCode) {
        setError(result.errorMessage ?? result.errorCode);
        return;
      }
      const asset = result.assets?.[0];
      freeze(asset?.uri ?? null);
      if (live) {
        if (asset?.base64) {
          await readPhoto(asset.base64, asset.type ?? 'image/jpeg');
        } else {
          setError('Could not read that photo.');
        }
      }
    } catch (err) {
      showError(err);
    }
  };

  const onReadThis = async () => {
    setBusy(true);
    try {
      const reading = await readSelection(frozenUri, box);
      setSheet({ kind: 'reading', reading });
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const answerRecognition = async (tango: Tango, recognized: boolean) => {
    setSheet(null);
    try {
      await recordRecognition(tango.id, recognized, placeName);
      setToast({
        jp: tango,
        text: recognized
          ? 'nice. Review pushed later.'
          : 'okay. It will come back sooner.',
      });
    } catch (err) {
      showError(err);
    }
  };

  const examples = (tango: Tango) =>
    orderExamples(tango.examples, settings.phrasesFirst);

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* Camera feed, frozen photo, or placeholder */}
      {phase === 'frozen' ? (
        frozenUri ? (
          <Image
            source={{ uri: frozenUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderPhoto}>
            {PLACEHOLDER_PHOTO_LINES.map(line => (
              <Jp
                key={line}
                text={line}
                size="xxl"
                tone="inverse"
                alwaysKanji
              />
            ))}
          </View>
        )
      ) : cameraReady && device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused}
          outputs={outputs}
        />
      ) : (
        <View style={styles.noCamera}>
          <Text style={styles.noCameraText}>
            Camera preview unavailable (no camera or no permission). Mock
            detection still runs.
          </Text>
          {permission.canRequestPermission ? (
            <Button
              label="Allow camera"
              variant="light"
              onPress={requestPermission}
            />
          ) : null}
        </View>
      )}

      {/* Detection overlay */}
      {phase !== 'frozen' && size.width > 0
        ? frame.items.map(item => {
            const r = boxOf(item.bounding_box);
            const isCaught = !!caught[item.item_id];
            const isCentered = centered?.item_id === item.item_id;
            const left = r.x * size.width;
            const top = r.y * size.height;
            const width = r.w * size.width;
            const height = r.h * size.height;
            return (
              <Pressable
                key={item.item_id}
                accessibilityRole="button"
                accessibilityLabel={`Look up ${item.japanese_text}`}
                onPress={() => openDetection(item)}
                style={[
                  styles.detection,
                  item.known
                    ? styles.detectionKnown
                    : isCaught
                    ? styles.detectionCaught
                    : isCentered
                    ? styles.detectionCentered
                    : styles.detectionNew,
                  { left, top, width, height },
                ]}
              >
                <View style={styles.tagWrap}>
                  {item.known ? (
                    <View style={[styles.tag, styles.tagKnown]}>
                      <Text style={styles.tagTextDark}>★</Text>
                      <Jp
                        text={item.japanese_text}
                        reading={item.reading ?? undefined}
                        size="xs"
                      />
                      <Text style={styles.tagTextDark}>· you know this</Text>
                    </View>
                  ) : (
                    <View style={[styles.tag, isCaught && styles.tagSaved]}>
                      <Text
                        style={isCaught ? styles.tagTextDark : styles.tagText}
                      >
                        {isCaught ? '✓ Saved' : 'New Tango'}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })
        : null}

      {/* Manual box on a frozen frame (mock only: the backend can't read a selected area yet) */}
      {phase === 'frozen' && !live && size.width > 0 ? (
        <SelectionBox
          width={size.width}
          height={size.height}
          initial={DEFAULT_BOX}
          onChange={setBox}
        />
      ) : null}

      {/* Top bar */}
      <View style={[styles.topBar, { top: insets.top + space.sm }]}>
        <IconButton
          glyph="✕"
          label="Close camera"
          dark
          onPress={() => navigation.replace('CaptureToday')}
        />
        <View style={styles.placePill}>
          <Text style={styles.pillText} numberOfLines={1}>
            ⌖ {placeName}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${count} caught today. Open today's catch`}
          onPress={() => navigation.navigate('CaptureToday')}
          style={[styles.countPill, count > 0 && styles.countPillActive]}
        >
          <Text style={styles.pillText}>▮ {count}</Text>
        </Pressable>
      </View>
      {phase === 'frozen' ? (
        <View
          style={[
            styles.frozenNote,
            { top: insets.top + sizes.touch + space.lg },
          ]}
        >
          <Text style={styles.pillText}>
            {live
              ? busy
                ? 'Photo taken · reading…'
                : `Photo taken · ${found?.items.length ?? 0} found`
              : 'Photo taken · nothing was detected'}
          </Text>
        </View>
      ) : null}

      {/* Bottom controls */}
      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}
      >
        {toast ? (
          <Toast
            message={
              <View style={base.row}>
                {toast.jp ? <Jp {...toast.jp} bold /> : null}
                <Text style={base.caption}>{toast.text}</Text>
              </View>
            }
            actions={
              toast.undo
                ? [
                    {
                      label: 'Details',
                      onPress: () =>
                        toast.undo &&
                        navigation.navigate('TangoDetail', {
                          id: toast.undo.tangoId,
                        }),
                    },
                    {
                      label: 'Undo',
                      onPress: () => toast.undo && undo(toast.undo),
                    },
                  ]
                : undefined
            }
          />
        ) : null}
        {error ? (
          <Pressable onPress={() => setError(null)} style={styles.hint}>
            <Text style={styles.hintText}>{error} (tap to dismiss)</Text>
          </Pressable>
        ) : null}

        {phase === 'frozen' && live ? (
          <View style={base.row}>
            <Button
              label="Retake"
              variant="dark"
              style={base.grow}
              onPress={unfreeze}
            />
            <Button
              label={busy ? 'Reading…' : 'Show results'}
              style={base.grow}
              disabled={busy || !found}
              onPress={() => setSheet({ kind: 'found' })}
            />
          </View>
        ) : phase === 'frozen' ? (
          <>
            <View style={styles.hint}>
              <Text style={styles.hintText}>
                Drag the box around what you want, and the corner to resize.
                Handwriting, odd fonts and blurry signs all work.
              </Text>
            </View>
            <View style={base.row}>
              <Button
                label="Retake"
                variant="dark"
                style={base.grow}
                onPress={unfreeze}
              />
              <Button
                label={busy ? 'Reading…' : '✦ Read this'}
                style={base.grow}
                disabled={busy}
                onPress={onReadThis}
              />
            </View>
          </>
        ) : (
          <>
            {live || frame.hint ? (
              <View style={styles.hint}>
                <Text style={styles.hintText}>
                  {live ? LIVE_HINT : frame.hint}
                </Text>
              </View>
            ) : null}
            {/* Text/Objects only steers the mock detector; the backend returns both. */}
            {live ? null : (
              <View style={styles.modeToggle}>
                <SegmentedControl
                  options={[
                    { value: 'text', label: 'T  Text' },
                    { value: 'objects', label: '⬡  Objects' },
                  ]}
                  value={mode}
                  onChange={setMode}
                />
              </View>
            )}
            <View style={styles.controls}>
              <IconButton
                glyph="🖼"
                label="Import from photos"
                dark
                onPress={onImport}
              />
              <View style={styles.shutterSlot}>
                {phase === 'caught' ? (
                  <View style={[styles.catchButton, styles.caughtButton]}>
                    <Text style={styles.catchTitle}>✓ Caught!</Text>
                  </View>
                ) : centered ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Catch ${centered.japanese_text}`}
                    onPress={() => doCatch(centered)}
                    style={styles.catchButton}
                  >
                    <Text style={styles.catchTitle}>Catch</Text>
                    <Jp
                      text={centered.japanese_text}
                      reading={centered.reading ?? undefined}
                      size="sm"
                      tone="inverse"
                    />
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Shutter"
                    onPress={onShutter}
                    style={styles.shutter}
                  />
                )}
              </View>
              <View style={styles.controlSpacer} />
            </View>
          </>
        )}
      </View>

      {/* Sheets */}
      <BottomSheet visible={sheet !== null} onClose={() => setSheet(null)}>
        {sheet?.kind === 'tango' ? (
          <>
            <View style={base.rowBetween}>
              <Jp {...sheet.tango} size="xxl" bold />
              <IconButton glyph="🔈" label="Play audio (coming soon)" />
            </View>
            <Text style={styles.eyebrow}>✦ Explained by Gemini (mock)</Text>
            <Text style={base.text}>
              <Text style={styles.strong}>{sheet.tango.meaning}. </Text>
              {sheet.tango.explanation ?? ''}
            </Text>
            {sheet.tango.examples.length > 0 ? (
              <View style={base.stackSm}>
                <Text style={base.label}>Ways you might hear it</Text>
                {examples(sheet.tango).map(example => (
                  <View key={example.jp.text} style={styles.example}>
                    <Chip
                      label={example.register === 'easy' ? 'Easy' : 'Keigo'}
                      tone="outline"
                    />
                    <View style={base.grow}>
                      <Jp {...example.jp} />
                      <Text style={base.caption}>{example.jp.meaning}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={base.caption}>
              ⌖ Saved with this place: {placeName}
            </Text>
            <View style={base.row}>
              <Button
                label="Practice"
                variant="secondary"
                style={base.grow}
                onPress={() => {
                  setSheet(null);
                  navigation.navigate('TangoDetail', { id: sheet.tango.id });
                }}
              />
              <Button
                label="Save Tango"
                style={base.grow}
                disabled={!!caught[sheet.detection.item_id]}
                onPress={() => {
                  const target = sheet.detection;
                  setSheet(null);
                  doCatch(target);
                }}
              />
            </View>
          </>
        ) : null}

        {sheet?.kind === 'known' ? (
          <>
            <Chip label="★ You've learned this one" tone="star" />
            <View style={base.row}>
              <Jp {...sheet.tango} size="xxl" bold />
              <Text style={base.caption}>{sheet.tango.meaning}</Text>
            </View>
            <View style={styles.history}>
              <Text style={base.caption}>
                ⌖ First saved:{' '}
                {sheet.tango.history[sheet.tango.history.length - 1]?.detail ??
                  'unknown'}
                . You've seen it {sheet.tango.sightings.length} times since.
              </Text>
            </View>
            <Text style={base.heading}>Did you recognize this Tango?</Text>
            <View style={base.row}>
              <Button
                label="Not really"
                variant="secondary"
                style={base.grow}
                onPress={() => answerRecognition(sheet.tango, false)}
              />
              <Button
                label="Yes"
                style={base.grow}
                onPress={() => answerRecognition(sheet.tango, true)}
              />
            </View>
            <Text style={base.caption}>
              We'll tailor your review schedule based on your answer.
            </Text>
          </>
        ) : null}

        {sheet?.kind === 'found' && found ? (
          <>
            <Text style={styles.eyebrow}>✦ Found in this photo</Text>
            {error ? <Text style={styles.sheetError}>{error}</Text> : null}
            {toast && !error ? (
              <View style={base.row}>
                {toast.jp ? <Jp {...toast.jp} bold /> : null}
                <Text style={[base.caption, base.grow]}>{toast.text}</Text>
                {toast.undo ? (
                  <Text
                    accessibilityRole="button"
                    style={styles.sheetUndo}
                    onPress={() => toast.undo && undo(toast.undo)}
                  >
                    Undo
                  </Text>
                ) : null}
              </View>
            ) : null}
            {found.items.length === 0 ? (
              <>
                <Text style={base.text}>
                  Nothing readable was found. Try again closer, or with the text
                  straight on.
                </Text>
                <Button label="Retake" variant="dark" onPress={unfreeze} />
              </>
            ) : null}
            {found.items.map(item => (
              <View key={item.item_id} style={styles.foundRow}>
                <View style={base.grow}>
                  <Jp
                    text={item.japanese_text}
                    reading={item.reading ?? undefined}
                    meaning={item.english_gloss ?? undefined}
                    size="lg"
                    bold
                  />
                  <Text style={base.caption}>
                    {item.english_gloss ?? item.source_label}
                    {item.item_type === 'object' ? ' · object' : ''}
                  </Text>
                </View>
                <Button
                  label={
                    caught[item.item_id]
                      ? '✓ Saved'
                      : saving === item.item_id
                      ? 'Saving…'
                      : 'Catch'
                  }
                  disabled={!!caught[item.item_id] || saving !== null}
                  onPress={() => catchFound(item)}
                />
              </View>
            ))}
          </>
        ) : null}

        {sheet?.kind === 'reading' ? (
          <>
            <Text style={styles.eyebrow}>
              ✦ Gemini read your selection (mock)
            </Text>
            <Jp {...sheet.reading.tango} size="xxl" bold />
            <Text style={base.text}>{sheet.reading.explanation}</Text>
            <View style={base.wrap}>
              {sheet.reading.related.map(jp => (
                <Chip key={jp.text} jp={jp} label={jp.meaning} dashed />
              ))}
            </View>
            <Button
              label="Catch"
              onPress={() => catchFromReading(sheet.reading)}
            />
            <Button
              label="Not quite? Adjust the box"
              variant="ghost"
              onPress={() => setSheet(null)}
            />
          </>
        ) : null}
      </BottomSheet>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.textInverse} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.camera,
  },
  noCamera: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  noCameraText: {
    ...base.caption,
    color: colors.textInverse,
    textAlign: 'center',
  },
  placeholderPhoto: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  detection: {
    position: 'absolute',
    borderRadius: radii.sm,
    borderWidth: sizes.border,
  },
  detectionNew: {
    borderStyle: 'dashed',
    borderColor: colors.accentSoft,
  },
  detectionCentered: {
    borderColor: colors.accent,
    backgroundColor: colors.scrim,
  },
  detectionCaught: {
    borderColor: colors.accent,
  },
  detectionKnown: {
    borderColor: colors.star,
  },
  tagWrap: {
    position: 'absolute',
    top: -(sizes.touch / 2 + space.xs),
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
  },
  tagKnown: {
    backgroundColor: colors.star,
  },
  tagSaved: {
    backgroundColor: colors.surface,
  },
  tagText: {
    ...base.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textInverse,
  },
  tagTextDark: {
    ...base.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  topBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  placePill: {
    flexShrink: 1,
    backgroundColor: colors.overlay,
    borderRadius: radii.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  pillText: {
    ...base.text,
    fontSize: fontSizes.sm,
    color: colors.textInverse,
  },
  countPill: {
    minWidth: sizes.touch,
    height: sizes.touch,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  countPillActive: {
    backgroundColor: colors.accent,
  },
  frozenNote: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.overlay,
    borderRadius: radii.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  hint: {
    backgroundColor: colors.overlay,
    borderRadius: radii.md,
    padding: space.sm,
  },
  hintText: {
    ...base.caption,
    color: colors.textInverse,
    textAlign: 'center',
  },
  modeToggle: {
    alignSelf: 'center',
    minWidth: sizes.mapHeight,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shutterSlot: {
    flex: 1,
    alignItems: 'center',
  },
  controlSpacer: {
    width: sizes.touch,
  },
  shutter: {
    width: sizes.shutter,
    height: sizes.shutter,
    borderRadius: radii.pill,
    borderWidth: space.xs,
    borderColor: colors.surface,
    backgroundColor: colors.overlay,
  },
  catchButton: {
    minHeight: sizes.shutter,
    minWidth: sizes.shutter * 2,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  caughtButton: {
    backgroundColor: colors.positive,
  },
  catchTitle: {
    ...base.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textInverse,
  },
  eyebrow: {
    ...base.label,
    color: colors.accent,
  },
  strong: {
    fontWeight: fontWeights.bold,
  },
  sheetUndo: {
    ...base.caption,
    color: colors.accent,
    fontWeight: fontWeights.bold,
    padding: space.xs,
  },
  sheetError: {
    ...base.caption,
    color: colors.caution,
  },
  foundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.border,
  },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: space.sm,
  },
  history: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: space.md,
  },
  busy: {
    ...FILL,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
