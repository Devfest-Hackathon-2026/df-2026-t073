import { useIsFocused } from '@react-navigation/native';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  type CurrentPlace,
  getCurrentPlace,
  getTodaysCatch,
  readSelection,
  recordRecognition,
  undoCatch,
  type UndoTarget,
  uploadCapture,
} from '../../api/capture';
import { isLive } from '../../config';
import { useDefinitions } from '../../api/dictionary';
import { playWord } from '../../features/tango/saveWord';
import { getTango, listTango } from '../../api/tango';
import { Hanamaru } from '../../components/Hanamaru';
import { Jp } from '../../components/Jp';
import { BottomSheet, Toast } from '../../components/layout';
import {
  Button,
  Chip,
  IconButton,
  IconLabel,
  SegmentedControl,
} from '../../components/ui';
import {
  boxOf,
  type DetectorFrame,
  type DetectorMode,
  EMPTY_FRAME,
  mockDetector,
} from '../../features/capture/detector';
import {
  coverRect,
  screenToPhoto,
  pickAimed,
  type Size,
  uprightSize,
} from '../../features/capture/photoBoxes';
import { type LiveRead, useLiveText } from '../../features/capture/liveText';
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
import { copy } from '../../copy';

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
const CAUGHT_MS = 500;
/** Upload size: enough for small sign text, well under the backend's 10 MiB limit. */
const PHOTO_SIZE = { width: 1600, height: 1200 };
const LIVE_HINT: Record<DetectorMode, string> = copy.capture.liveHint;
/** How close to the screen center a live word must be to count as aimed at. */
const AIM_SLOP = 48;
/** The aim frame: a centered square this share of the screen width. */
const AIM_WIDTH = 0.4;
/** Upright live frame size until the first frame reports the real one. */
const FRAME_GUESS = { width: 720, height: 960 };
const round2 = (v: number) => Math.round(v * 100) / 100;
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
    stage: 'flashcard',
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
  // Live: Japanese text read on the phone while aiming (no network).
  const liveRef = useRef<(read: LiveRead) => void>(() => {});
  const onLiveRead = useCallback((read: LiveRead) => liveRef.current(read), []);
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
  const [place, setPlace] = useState<CurrentPlace>({
    name: copy.capture.placeFinding,
    placeId: null,
    lat: null,
    lng: null,
  });
  const placeName = place.name;
  // Sent with every catch so the Tango gets a pin on the map. Only a matched
  // place has a name worth saving; "Location off" / "Near you" are just labels.
  const where = {
    placeName: place.placeId ? placeName : undefined,
    placeId: place.placeId ?? undefined,
    lat: place.lat ?? undefined,
    lng: place.lng ?? undefined,
  };
  const [count, setCount] = useState(0);
  const [caught, setCaught] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [frozenUri, setFrozenUri] = useState<string | null>(null);
  const [box, setBox] = useState<NormalizedBox>(DEFAULT_BOX);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  // Live photo reads: upright photo size (to place boxes) and the picked item.
  const [photoSize, setPhotoSize] = useState<Size | null>(null);
  // Picked boxes in the order they were touched; several join into one word.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const dragged = useRef<string[]>([]);
  // Live aiming: upright camera frame size, and Tango the user already has.
  const [liveSize, setLiveSize] = useState<Size | null>(null);
  const owned = useRef(new Map<string, string>());
  // What the overlay last showed, to skip re-rendering when nothing moved.
  const lastLive = useRef('');

  // Live aim frame: a centered square; text inside it is read first.
  const aimSide = size.width * AIM_WIDTH;
  const aimRect = {
    left: (size.width - aimSide) / 2,
    top: (size.height - aimSide) / 2,
    width: aimSide,
    height: aimSide,
  };
  const aimArea =
    size.width > 0
      ? screenToPhoto(aimRect, liveSize ?? FRAME_GUESS, size)
      : { x: 0, y: 0, w: 1, h: 1 };
  const textOutput = useLiveText(onLiveRead, {
    x: round2(aimArea.x),
    y: round2(aimArea.y),
    w: round2(aimArea.w),
    h: round2(aimArea.h),
  });
  const outputs = useMemo(
    () => (live && mode === 'text' ? [photoOutput, textOutput] : [photoOutput]),
    [live, mode, photoOutput, textOutput],
  );
  const [saving, setSaving] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    getCurrentPlace()
      .then(setPlace)
      .catch(() =>
        setPlace({
          name: copy.capture.placeUnknown,
          placeId: null,
          lat: null,
          lng: null,
        }),
      );
    getTodaysCatch()
      .then(list => setCount(list.length))
      .catch(() => {});
    if (live) {
      listTango()
        .then(list => list.forEach(t => owned.current.set(t.text, t.id)))
        .catch(() => {});
    }
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [live]);

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

  const picked = selectedIds
    .map(id => found?.items.find(item => item.item_id === id))
    .filter((item): item is DetectedItem => !!item);
  const pickedText = picked.map(item => item.japanese_text).join('');
  // Dictionary readings and meanings for every word on screen (cached).
  const defs = useDefinitions([
    ...frame.items.map(item => item.japanese_text),
    ...(found?.items.map(item => item.japanese_text) ?? []),
    ...(pickedText ? [pickedText] : []),
  ]);
  /** First sense only, e.g. "meal ticket". */
  const shortMeaning = (item: DetectedItem): string | null =>
    defs[item.japanese_text]?.meaning.split(';')[0] ?? item.english_gloss;
  const pickedDef = pickedText ? defs[pickedText] : undefined;
  const pickedSaved =
    picked.length > 0 && picked.every(item => caught[item.item_id]);
  const boxOnScreen = (item: DetectedItem) =>
    coverRect(boxOf(item.bounding_box), photoSize ?? size, size);

  /** The box under the finger (the smallest one, if they overlap). */
  const boxAt = (x: number, y: number): DetectedItem | null => {
    const slop = space.sm;
    let best: { item: DetectedItem; area: number } | null = null;
    for (const item of found?.items ?? []) {
      if (item.bounding_box.length === 0) {
        continue;
      }
      const r = boxOnScreen(item);
      const hit =
        x >= r.left - slop &&
        x <= r.left + r.width + slop &&
        y >= r.top - slop &&
        y <= r.top + r.height + slop;
      if (hit && (!best || r.width * r.height < best.area)) {
        best = { item, area: r.width * r.height };
      }
    }
    return best?.item ?? null;
  };

  // Frozen photo: tap a box to pick it; drag across boxes to join them in
  // the order touched (text only, since joined object names make no sense).
  const onPickStart = (x: number, y: number) => {
    const item = boxAt(x, y);
    dragged.current = item ? [item.item_id] : [];
    if (item) {
      setSelectedIds([item.item_id]);
    } else {
      setSelectedIds([]);
    }
  };
  const onPickMove = (x: number, y: number) => {
    const item = boxAt(x, y);
    if (!item || dragged.current.includes(item.item_id)) {
      return;
    }
    dragged.current =
      mode === 'text' ? [...dragged.current, item.item_id] : [item.item_id];
    setSelectedIds(dragged.current);
  };
  // Each live frame outlines Japanese words; they are selectable only after a photo.
  liveRef.current = (read: LiveRead) => {
    if (phase !== 'live' || mode !== 'text' || size.width === 0) {
      return;
    }
    // Repeated text would give two overlay items the same key; keep the first.
    const unique = read.lines.filter(
      (line, i) =>
        read.lines.findIndex(other => other.text === line.text) === i,
    );
    const items: Detection[] = unique.map(line => {
      const tangoId = owned.current.get(line.text);
      return {
        item_id: `live:${line.text}`,
        item_type: 'text',
        source_label: line.text,
        japanese_text: line.text,
        reading: null,
        english_gloss: null,
        confidence: null,
        bounding_box: [
          { x: line.x, y: line.y },
          { x: line.x + line.w, y: line.y + line.h },
        ],
        known: !!tangoId,
        tangoId,
      };
    });
    const aim = pickAimed(
      items.filter(i => !i.known && !caught[i.item_id]),
      read.size,
      size,
      undefined,
      AIM_SLOP,
    );
    // Re-render only when words or their rough positions change (2% steps);
    // this screen is large and most reads look the same as the last one.
    const key = [
      aim?.item_id ?? '',
      read.size.width,
      read.size.height,
      ...read.lines.map(
        l =>
          `${l.text}@${Math.round(l.x * 50)},${Math.round(l.y * 50)},` +
          `${Math.round(l.w * 50)},${Math.round(l.h * 50)}`,
      ),
    ].join('|');
    if (key === lastLive.current) {
      return;
    }
    lastLive.current = key;
    if (
      liveSize?.width !== read.size.width ||
      liveSize?.height !== read.size.height
    ) {
      setLiveSize(read.size);
    }
    setFrame({
      items,
      centeredId: aim?.item_id ?? null,
      hint: aim ? '' : items.length ? copy.capture.centerAWord : '',
    });
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
    setError(err instanceof Error ? err.message : copy.capture.somethingWrong);

  const doCatch = async (detection: Detection) => {
    // Show the catch right away; the save finishes in the background and
    // then adds Undo to the toast.
    setPhase('caught');
    setCaught(ids => ({ ...ids, [detection.item_id]: true }));
    setToast({
      jp: {
        text: detection.japanese_text,
        reading: detection.reading ?? undefined,
      },
      text: copy.capture.caughtHere,
    });
    later(() => setPhase('live'), CAUGHT_MS);
    try {
      const { tango, created, sightingId } = await catchTango({
        detection,
        language: settings.explanationsLanguage,
        ...where,
      });
      owned.current.set(tango.text, tango.id);
      if (created) {
        setCount(n => n + 1);
      }
      setToast({
        jp: tango,
        text: created ? copy.capture.caughtHere : copy.capture.seenAgainHere,
        undo: {
          tangoId: tango.id,
          sightingId,
          itemId: detection.item_id,
          created,
        },
      });
    } catch (err) {
      setCaught(ids => ({ ...ids, [detection.item_id]: false }));
      setToast(null);
      showError(err);
    }
  };

  const catchFromReading = async (reading: SelectionReading) => {
    setSheet(null);
    try {
      const { tango, created, sightingId } = await catchTango({
        tangoId: reading.tango.id,
        language: settings.explanationsLanguage,
        ...where,
      });
      if (created) {
        setCount(n => n + 1);
      }
      setToast({
        jp: tango,
        text: created
          ? copy.capture.savedPinnedHere
          : copy.capture.seenAgainHere,
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

  const freeze = (uri: string | null, shot: Size | null = null) => {
    setFrozenUri(uri);
    setPhotoSize(shot);
    setBox(DEFAULT_BOX);
    setFrame(EMPTY_FRAME);
    lastLive.current = '';
    setPhase('frozen');
  };

  const unfreeze = () => {
    setFrozenUri(null);
    setFound(null);
    setSelectedIds([]);
    setSheet(null);
    setPhase('live');
  };

  /** Sends a photo to the backend and lists what it found. */
  const readPhoto = async (
    base64: string,
    mimeType: string,
    shot: Size | null,
  ) => {
    setError(null);
    // Item IDs repeat across photos, so "saved" marks belong to one photo only.
    setCaught({});
    setSelectedIds([]);
    setBusy(true);
    try {
      const result = await uploadCapture(base64, mimeType, where);
      // The backend reads both; show only what the toggle asks for.
      const kind = mode === 'text' ? 'text' : 'object';
      const items = result.detected_items.filter(i => i.item_type === kind);
      setFound({ captureId: result.capture_id, items });
      if (mode === 'objects') {
        const first = pickAimed(items, shot ?? size, size);
        if (first) {
          setSelectedIds([first.item_id]);
        }
      }
      if (items.length === 0) {
        setError(
          mode === 'text'
            ? copy.capture.noTextFound
            : copy.capture.noObjectFound,
        );
      }
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
        language: settings.explanationsLanguage,
        ...where,
      });
      setCaught(ids => ({ ...ids, [item.item_id]: true }));
      if (created) {
        setCount(n => n + 1);
      }
      setToast({
        jp: tango,
        text: created ? copy.capture.caughtHere : copy.capture.seenAgainHere,
        undo: { tangoId: tango.id, sightingId, itemId: item.item_id, created },
      });
    } catch (err) {
      showError(err);
    } finally {
      setSaving(null);
    }
  };

  /** Catches the picked box, or the picked boxes joined into one word. */
  const catchPicked = async () => {
    if (!found || picked.length === 0) {
      return;
    }
    if (picked.length === 1) {
      await catchFound(picked[0]);
      return;
    }
    const ids = picked.map(item => item.item_id);
    setError(null);
    setSaving(ids[0]);
    try {
      const { tango, created, sightingId } = await catchTango({
        detection: {
          ...picked[0],
          japanese_text: pickedText,
          reading: null,
          english_gloss: null,
          known: false,
        },
        captureId: found.captureId,
        language: settings.explanationsLanguage,
        ...where,
      });
      setCaught(prev => ({
        ...prev,
        ...Object.fromEntries(ids.map(id => [id, true])),
      }));
      if (created) {
        setCount(n => n + 1);
      }
      setToast({
        jp: tango,
        text: created ? copy.capture.caughtHere : copy.capture.seenAgainHere,
        undo: { tangoId: tango.id, sightingId, created },
      });
    } catch (err) {
      showError(err);
    } finally {
      setSaving(null);
    }
  };

  const onShutterLive = async () => {
    if (!cameraReady) {
      setError(copy.capture.noCamera);
      return;
    }
    try {
      const photo = await photoOutput.capturePhoto(
        { enableShutterSound: false },
        {},
      );
      try {
        const shot = uprightSize(photo.width, photo.height, photo.orientation);
        const path = await photo.saveToTemporaryFileAsync();
        const bytes = await photo.getFileDataAsync();
        freeze(path.startsWith('file://') ? path : `file://${path}`, shot);
        await readPhoto(
          fromByteArray(new Uint8Array(bytes)),
          'image/jpeg',
          shot,
        );
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
    const textItems: DetectedItem[] =
      mode === 'text'
        ? frame.items
            .filter(item => item.item_type === 'text')
            .map(item => ({
              item_id: item.item_id,
              item_type: item.item_type,
              source_label: item.source_label,
              japanese_text: item.japanese_text,
              reading: item.reading,
              english_gloss: item.english_gloss,
              confidence: item.confidence,
              bounding_box: item.bounding_box,
            }))
        : [];
    let uri: string | null = null;
    if (cameraReady) {
      try {
        const file = await photoOutput.capturePhotoToFile(
          { enableShutterSound: false },
          {},
        );
        uri = `file://${file.filePath}`;
      } catch {
        uri = null;
      }
    }
    freeze(uri);
    if (mode === 'text') {
      setFound({ captureId: 'cap_mock', items: textItems });
      if (textItems.length === 0) {
        setError(copy.capture.noTextFound);
      }
    }
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
      const shot =
        asset?.width && asset?.height
          ? { width: asset.width, height: asset.height }
          : null;
      freeze(asset?.uri ?? null, shot);
      if (live) {
        if (asset?.base64) {
          await readPhoto(asset.base64, asset.type ?? 'image/jpeg', shot);
        } else {
          setError(copy.capture.couldNotReadPhoto);
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
      await recordRecognition(tango.id, recognized, where);
      setToast({
        jp: tango,
        text: recognized
          ? copy.capture.recognizedYes
          : copy.capture.recognizedNo,
      });
    } catch (err) {
      showError(err);
    }
  };

  const examples = (tango: Tango) =>
    orderExamples(tango.examples, settings.phrasesFirst);
  const photoSelection = live || (mode === 'text' && found !== null);

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
          <Text style={styles.noCameraText}>{copy.capture.noPreview}</Text>
          {permission.canRequestPermission ? (
            <Button
              label={copy.capture.allowCamera}
              variant="light"
              onColor={colors.camera}
              onPress={requestPermission}
            />
          ) : null}
        </View>
      )}

      {/* Live: the area that is read. Point at a word to put it inside. */}
      {live && phase === 'live' && cameraReady && size.width > 0 ? (
        <View pointerEvents="none" style={[styles.aim, aimRect]}>
          <View style={[styles.aimCorner, styles.aimTopLeft]} />
          <View style={[styles.aimCorner, styles.aimTopRight]} />
          <View style={[styles.aimCorner, styles.aimBottomLeft]} />
          <View style={[styles.aimCorner, styles.aimBottomRight]} />
        </View>
      ) : null}

      {/* Detection overlay */}
      {phase !== 'frozen' && size.width > 0
        ? frame.items.map(item => {
            // Mock boxes are fractions of the screen; live ones of the frame.
            const { left, top, width, height } = coverRect(
              boxOf(item.bounding_box),
              live ? liveSize ?? size : size,
              size,
            );
            const isCaught = !!caught[item.item_id];
            const isCentered = centered?.item_id === item.item_id;
            return (
              <Pressable
                key={item.item_id}
                accessibilityRole={mode === 'text' ? undefined : 'button'}
                accessibilityLabel={
                  mode === 'text'
                    ? undefined
                    : copy.capture.lookUp(item.japanese_text)
                }
                onPress={
                  mode === 'text' ? undefined : () => openDetection(item)
                }
                pointerEvents={mode === 'text' ? 'none' : 'auto'}
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
                      <Hanamaru size={fontSizes.sm} />
                      <Jp
                        text={item.japanese_text}
                        reading={item.reading ?? undefined}
                        size="xs"
                      />
                      <Text style={styles.tagTextDark}>
                        {copy.capture.youKnowThis}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.tag, isCaught && styles.tagSaved]}>
                      <Text
                        style={isCaught ? styles.tagTextDark : styles.tagText}
                      >
                        {isCaught
                          ? copy.capture.saved
                          : shortMeaning(item) ?? copy.capture.newTango}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })
        : null}

      {/* Live photo: every box dotted; tap one, or drag across several to join */}
      {phase === 'frozen' && photoSelection && found && size.width > 0
        ? found.items.map(item => {
            if (item.bounding_box.length === 0) {
              return null;
            }
            const order = selectedIds.indexOf(item.item_id);
            return (
              <View
                key={item.item_id}
                pointerEvents="none"
                style={[
                  styles.detection,
                  order >= 0
                    ? styles.detectionCentered
                    : caught[item.item_id]
                    ? styles.detectionCaught
                    : styles.detectionDotted,
                  boxOnScreen(item),
                ]}
              >
                {shortMeaning(item) ? (
                  <View style={styles.tagWrap}>
                    <View style={[styles.tag, order < 0 && styles.tagQuiet]}>
                      <Text style={styles.tagText} numberOfLines={1}>
                        {shortMeaning(item)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {order >= 0 && selectedIds.length > 1 ? (
                  <View style={styles.orderTag}>
                    <Text style={styles.tagText}>{order + 1}</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        : null}
      {phase === 'frozen' && photoSelection ? (
        <View
          style={StyleSheet.absoluteFill}
          accessibilityLabel={copy.capture.frozenA11y}
          onStartShouldSetResponder={() => !!found && !busy}
          onMoveShouldSetResponder={() => !!found && !busy}
          onResponderGrant={e =>
            onPickStart(e.nativeEvent.locationX, e.nativeEvent.locationY)
          }
          onResponderMove={e =>
            onPickMove(e.nativeEvent.locationX, e.nativeEvent.locationY)
          }
        />
      ) : null}

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
          icon="close"
          label={copy.capture.closeCamera}
          dark
          onPress={() => navigation.goBack()}
        />
        <View style={styles.placePill}>
          <IconLabel icon="pin" style={styles.pillText} numberOfLines={1}>
            {placeName}
          </IconLabel>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.capture.caughtToday(count)}
          onPress={() => navigation.navigate('CaptureToday')}
          style={[styles.countPill, count > 0 && styles.countPillActive]}
        >
          <IconLabel icon="learn" style={styles.pillText}>
            {count}
          </IconLabel>
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
                ? copy.capture.photoReading
                : copy.capture.photoFound(found?.items.length ?? 0)
              : copy.capture.photoNothing}
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
                      label: copy.capture.details,
                      onPress: () =>
                        toast.undo &&
                        navigation.navigate('TangoDetail', {
                          id: toast.undo.tangoId,
                        }),
                    },
                    {
                      label: copy.capture.undo,
                      onPress: () => toast.undo && undo(toast.undo),
                    },
                  ]
                : undefined
            }
          />
        ) : null}
        {error ? (
          <Pressable
            onPress={() => setError(null)}
            style={styles.hint}
            accessibilityRole="button"
          >
            <Text style={styles.hintText}>
              {copy.capture.tapToDismiss(error)}
            </Text>
          </Pressable>
        ) : null}

        {phase === 'frozen' && photoSelection ? (
          <>
            {picked.length > 0 ? (
              <View style={styles.hint}>
                <Jp
                  text={pickedText}
                  reading={
                    pickedDef?.reading ??
                    (picked.length === 1
                      ? picked[0].reading ?? undefined
                      : undefined)
                  }
                  size="lg"
                  bold
                  tone="inverse"
                />
                {pickedDef || picked[0].english_gloss ? (
                  <Text style={styles.hintText}>
                    {pickedDef?.meaning ?? picked[0].english_gloss}
                  </Text>
                ) : null}
                {picked.length > 1 ? (
                  <Text style={styles.hintText}>
                    {copy.capture.partsJoined(picked.length)}
                  </Text>
                ) : null}
                <Text style={styles.hintText}>
                  {mode === 'text'
                    ? copy.capture.pickOrJoin
                    : copy.capture.pick}
                </Text>
              </View>
            ) : found && found.items.length > 0 ? (
              <View style={styles.hint}>
                <Text style={styles.hintText}>{copy.capture.selectText}</Text>
              </View>
            ) : null}
            <View style={base.row}>
              <Button
                label={copy.capture.retake}
                variant="dark"
                style={base.grow}
                onPress={unfreeze}
              />
              {picked.length > 0 ? (
                <Button
                  label={
                    busy
                      ? copy.capture.reading
                      : pickedSaved
                      ? copy.capture.saved
                      : saving !== null
                      ? copy.capture.saving
                      : copy.capture.catch
                  }
                  style={base.grow}
                  disabled={busy || pickedSaved || saving !== null}
                  onPress={catchPicked}
                />
              ) : null}
            </View>
          </>
        ) : phase === 'frozen' ? (
          <>
            <View style={styles.hint}>
              <Text style={styles.hintText}>{copy.capture.dragBox}</Text>
            </View>
            <View style={base.row}>
              <Button
                label={copy.capture.retake}
                variant="dark"
                style={base.grow}
                onPress={unfreeze}
              />
              <Button
                label={busy ? copy.capture.reading : copy.capture.readThis}
                icon={busy ? undefined : 'ai'}
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
                  {frame.hint || LIVE_HINT[mode]}
                </Text>
              </View>
            ) : null}
            {/* Text: live outlines + text from photos. Objects: photos only. */}
            <View style={styles.modeToggle}>
              <SegmentedControl
                options={[
                  { value: 'text', label: copy.capture.modeText, icon: 'scan' },
                  {
                    value: 'objects',
                    label: copy.capture.modeObjects,
                    icon: 'photo',
                  },
                ]}
                value={mode}
                onChange={next => {
                  setMode(next);
                  setFrame(EMPTY_FRAME);
                  lastLive.current = '';
                }}
              />
            </View>
            <View style={styles.controls}>
              <IconButton
                icon="photo"
                label={copy.capture.importPhotos}
                dark
                onPress={onImport}
              />
              <View style={styles.shutterSlot}>
                {phase === 'caught' ? (
                  <View style={[styles.catchButton, styles.caughtButton]}>
                    <IconLabel icon="done" style={styles.catchTitle}>
                      {copy.capture.caught}
                    </IconLabel>
                  </View>
                ) : centered && mode !== 'text' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.capture.catchWord(
                      centered.japanese_text,
                    )}
                    onPress={() => doCatch(centered)}
                    style={styles.catchButton}
                  >
                    <Text style={styles.catchTitle}>{copy.capture.catch}</Text>
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
                    accessibilityLabel={copy.capture.shutter}
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
              <IconButton
                icon="play"
                label={copy.common.play(sheet.tango.text)}
                onPress={() => playWord(sheet.tango.text)}
              />
            </View>
            <IconLabel icon="ai" style={styles.eyebrow}>
              {copy.capture.explainedBy}
            </IconLabel>
            <Text style={base.text}>
              <Text style={styles.strong}>{sheet.tango.meaning}. </Text>
              {sheet.tango.explanation ?? ''}
            </Text>
            {sheet.tango.examples.length > 0 ? (
              <View style={base.stackSm}>
                <Text style={base.label}>{copy.capture.waysToHear}</Text>
                {examples(sheet.tango).map(example => (
                  <View key={example.jp.text} style={styles.example}>
                    <Chip
                      label={
                        example.register === 'easy'
                          ? copy.capture.registerEasy
                          : copy.capture.registerKeigo
                      }
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
            <IconLabel icon="pin" style={base.caption}>
              {placeName}
            </IconLabel>
            <View style={base.row}>
              <Button
                label={copy.capture.practice}
                variant="secondary"
                style={base.grow}
                onPress={() => {
                  setSheet(null);
                  navigation.navigate('TangoDetail', { id: sheet.tango.id });
                }}
              />
              <Button
                label={copy.capture.saveTango}
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
            <Chip
              icon="hanamaru"
              label={copy.capture.learned}
              tone="hanamaru"
            />
            <View style={base.row}>
              <Jp {...sheet.tango} size="xxl" bold />
              <Text style={base.caption}>{sheet.tango.meaning}</Text>
            </View>
            <View style={styles.history}>
              <Text style={base.caption}>
                {copy.capture.firstSaved(
                  sheet.tango.history[sheet.tango.history.length - 1]?.detail ??
                    copy.capture.unknown,
                  sheet.tango.sightings.length,
                )}
              </Text>
            </View>
            <Text style={base.heading}>{copy.capture.recognizeQuestion}</Text>
            <View style={base.row}>
              <Button
                label={copy.capture.notReally}
                variant="secondary"
                style={base.grow}
                onPress={() => answerRecognition(sheet.tango, false)}
              />
              <Button
                label={copy.capture.yes}
                style={base.grow}
                onPress={() => answerRecognition(sheet.tango, true)}
              />
            </View>
            <Text style={base.caption}>{copy.capture.tailorNote}</Text>
          </>
        ) : null}

        {sheet?.kind === 'found' && found ? (
          <>
            <IconLabel icon="ai" style={styles.eyebrow}>
              {copy.capture.foundInPhoto}
            </IconLabel>
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
                    {copy.capture.undo}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {found.items.length === 0 ? (
              <>
                <Text style={base.text}>{copy.capture.nothingReadable}</Text>
                <Button
                  label={copy.capture.retake}
                  variant="dark"
                  onPress={unfreeze}
                />
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
                  </Text>
                  {item.item_type === 'object' ? (
                    <View style={base.row}>
                      <Chip label={copy.capture.objectTag} tone="outline" />
                    </View>
                  ) : null}
                </View>
                <Button
                  label={
                    caught[item.item_id]
                      ? copy.capture.saved
                      : saving === item.item_id
                      ? copy.capture.saving
                      : copy.capture.catch
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
            <IconLabel icon="ai" style={styles.eyebrow}>
              {copy.capture.geminiRead}
            </IconLabel>
            <Jp {...sheet.reading.tango} size="xxl" bold />
            <Text style={base.text}>{sheet.reading.explanation}</Text>
            <View style={base.wrap}>
              {sheet.reading.related.map(jp => (
                <Chip key={jp.text} jp={jp} label={jp.meaning} dashed />
              ))}
            </View>
            <Button
              label={copy.capture.catch}
              onPress={() => catchFromReading(sheet.reading)}
            />
            <Button
              label={copy.capture.adjustBox}
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
  aim: {
    position: 'absolute',
  },
  aimCorner: {
    position: 'absolute',
    width: space.xl,
    height: space.xl,
    borderColor: colors.surface,
  },
  aimTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: sizes.border * 2,
    borderLeftWidth: sizes.border * 2,
    borderTopLeftRadius: radii.sm,
  },
  aimTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: sizes.border * 2,
    borderRightWidth: sizes.border * 2,
    borderTopRightRadius: radii.sm,
  },
  aimBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: sizes.border * 2,
    borderLeftWidth: sizes.border * 2,
    borderBottomLeftRadius: radii.sm,
  },
  aimBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: sizes.border * 2,
    borderRightWidth: sizes.border * 2,
    borderBottomRightRadius: radii.sm,
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
  detectionDotted: {
    borderStyle: 'dotted',
    borderColor: colors.surface,
  },
  orderTag: {
    position: 'absolute',
    top: -space.md,
    left: -space.md,
    minWidth: space.lg + space.xs,
    height: space.lg + space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detectionCaught: {
    borderColor: colors.accent,
  },
  detectionKnown: {
    borderColor: colors.hanamaru,
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
  tagQuiet: {
    backgroundColor: colors.scrim,
  },
  tagKnown: {
    backgroundColor: colors.hanamaru,
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
    borderRadius: radii.button,
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
