import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type Frame, useFrameOutput } from 'react-native-vision-camera';
import { useTextRecognition } from 'react-native-vision-camera-mlkit';
import { scheduleOnRN } from 'react-native-worklets';
import type { NormalizedBox } from '../../types';
import type { Size } from './photoBoxes';

/** A line of Japanese text seen in a camera frame, box as 0-1 of the frame. */
export interface LiveLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LiveRead {
  lines: LiveLine[];
  /** Upright frame size, to place the boxes over the preview. */
  size: Size;
}

/** Longer lines are sentences or menus, not a Tango to catch. */
const MAX_CHARS = 16;
/** Lines smaller than this share of the biggest line are background text. */
const MIN_HEIGHT_SHARE = 0.6;
/** At most this many words are outlined at once. */
const MAX_LINES = 3;
/** Read about 3 frames a second; the rest are skipped. */
const READ_EVERY_MS = 300;
const FRAME_MS = 34;

/**
 * Reads Japanese text on the phone (ML Kit) from live camera frames. Words
 * inside `area` (0-1 of the upright frame: the on-screen aim frame) come
 * first; words elsewhere fill the remaining slots only if they're prominent.
 * Returns a camera output to attach; `onRead` gets each read's lines.
 * No network calls: the camera only talks to the backend on a catch.
 */
export function useLiveText(
  onRead: (read: LiveRead) => void,
  area: NormalizedBox,
) {
  const { x, y, w, h } = area;
  // The plugin rebuilds its recognizer whenever this object changes, so it
  // must be created once.
  const options = useMemo(() => ({ language: 'JAPANESE' as const }), []);
  const { textRecognition } = useTextRecognition(options);
  const latest = useRef(onRead);
  useEffect(() => {
    latest.current = onRead;
  });
  const deliver = useCallback((read: LiveRead) => latest.current(read), []);

  const onFrame = useMemo(
    () => (frame: Frame) => {
      'worklet';
      // Stateless throttle: only the frame at the start of each window is read.
      // Android reports nanoseconds, iOS seconds.
      const ms =
        frame.timestamp > 1e12 ? frame.timestamp / 1e6 : frame.timestamp * 1000;
      if (ms % READ_EVERY_MS > FRAME_MS) {
        frame.dispose();
        return;
      }
      try {
        // ML Kit boxes are in the upright image; the raw buffer may be sideways.
        const sideways =
          frame.orientation === 'left' || frame.orientation === 'right';
        const width = sideways ? frame.height : frame.width;
        const height = sideways ? frame.width : frame.height;
        const result = textRecognition(frame);
        const lines: LiveLine[] = [];
        // ML Kit can return the same line twice in one frame (e.g. a banner
        // split across blocks). Keep the first copy: React keys and the
        // caught/owned maps are keyed by text.
        const seen = new Set<string>();
        for (const block of result.blocks) {
          for (const line of block.lines) {
            const text = line.text.replace(/\s+/g, '');
            let japanese = false;
            for (let i = 0; i < text.length; i++) {
              const c = text.charCodeAt(i);
              // Hiragana, katakana, kanji.
              if (
                (c >= 0x3040 && c <= 0x30ff) ||
                (c >= 0x3400 && c <= 0x9fff)
              ) {
                japanese = true;
                break;
              }
            }
            if (!japanese || text.length > MAX_CHARS || seen.has(text)) {
              continue;
            }
            seen.add(text);
            lines.push({
              text,
              x: line.bounds.left / width,
              y: line.bounds.top / height,
              w: line.bounds.width / width,
              h: line.bounds.height / height,
            });
          }
        }
        // Words in the aim frame first (nearest its center first); elsewhere,
        // only prominent words, so small background text doesn't crowd in.
        let tallest = 0;
        for (const line of lines) {
          tallest = Math.max(tallest, line.h);
        }
        const cx = x + w / 2;
        const cy = y + h / 2;
        const inAim = (l: LiveLine) =>
          l.x < x + w && l.x + l.w > x && l.y < y + h && l.y + l.h > y;
        const distance = (l: LiveLine) =>
          Math.hypot(l.x + l.w / 2 - cx, l.y + l.h / 2 - cy);
        const inside = lines.filter(inAim);
        const outside = lines.filter(
          l => !inAim(l) && l.h >= tallest * MIN_HEIGHT_SHARE,
        );
        inside.sort((a, b) => distance(a) - distance(b));
        outside.sort((a, b) => distance(a) - distance(b));
        const shown = inside.concat(outside).slice(0, MAX_LINES);
        scheduleOnRN(deliver, { lines: shown, size: { width, height } });
      } catch {
        // A bad frame is skipped; the next one comes right after.
      } finally {
        frame.dispose();
      }
    },
    [textRecognition, deliver, x, y, w, h],
  );

  return useFrameOutput({
    // Small print isn't the target, so a modest frame size reads faster.
    targetResolution: { width: 960, height: 720 },
    pixelFormat: 'yuv',
    onFrame,
  });
}
