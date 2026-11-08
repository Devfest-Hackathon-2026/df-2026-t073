import {
  coverRect,
  pickAimed,
  screenToPhoto,
  uprightSize,
} from '../src/features/capture/photoBoxes';
import type { DetectedItem } from '../src/types';

const item = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  type: 'text' | 'object' = 'text',
): DetectedItem => ({
  item_id: id,
  item_type: type,
  source_label: id,
  japanese_text: id,
  reading: null,
  english_gloss: null,
  confidence: null,
  bounding_box: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
});

// A 3:4 photo on a taller 1:2 screen: height fits, sides are cropped.
const photo = { width: 300, height: 400 };
const view = { width: 400, height: 800 };

test('cover mapping crops the sides evenly', () => {
  const r = coverRect({ x: 0, y: 0, w: 1, h: 1 }, photo, view);
  expect(r.width).toBe(600);
  expect(r.height).toBe(800);
  expect(r.left).toBe(-100);
  expect(r.top).toBe(0);
});

test('picks the smallest text box under the center', () => {
  const items = [
    item('sign', 0.3, 0.3, 0.4, 0.4),
    item('word', 0.45, 0.45, 0.1, 0.1),
    item('far', 0, 0, 0.1, 0.1),
  ];
  expect(pickAimed(items, photo, view)?.item_id).toBe('word');
});

test('text under the center beats a bigger object', () => {
  const items = [
    item('bowl', 0, 0, 1, 1, 'object'),
    item('word', 0.4, 0.45, 0.2, 0.1),
  ];
  expect(pickAimed(items, photo, view)?.item_id).toBe('word');
});

test('falls back to the closest box when nothing is under the center', () => {
  const items = [
    item('near', 0.6, 0.45, 0.1, 0.1),
    item('far', 0, 0, 0.1, 0.1),
  ];
  expect(pickAimed(items, photo, view)?.item_id).toBe('near');
});

test('a tap picks the box under the finger', () => {
  const items = [
    item('top', 0.4, 0.1, 0.2, 0.1),
    item('mid', 0.4, 0.45, 0.2, 0.1),
  ];
  // "top" spans y 80..160 on screen; x 0.5 of the photo is the screen center.
  expect(pickAimed(items, photo, view, { x: 200, y: 120 })?.item_id).toBe(
    'top',
  );
});

test('a distance limit leaves far boxes unpicked', () => {
  const items = [item('far', 0, 0, 0.1, 0.1)];
  expect(pickAimed(items, photo, view, undefined, 40)).toBeNull();
});

test('screen box maps back to the same part of the photo', () => {
  const box = { x: 0.3, y: 0.4, w: 0.2, h: 0.1 };
  const back = screenToPhoto(coverRect(box, photo, view), photo, view);
  expect(back.x).toBeCloseTo(0.3);
  expect(back.y).toBeCloseTo(0.4);
  expect(back.w).toBeCloseTo(0.2);
  expect(back.h).toBeCloseTo(0.1);
});

test('no boxes means nothing to aim at', () => {
  expect(pickAimed([], photo, view)).toBeNull();
});

test('sideways captures swap width and height', () => {
  expect(uprightSize(1600, 1200, 'right')).toEqual({
    width: 1200,
    height: 1600,
  });
  expect(uprightSize(1600, 1200, 'up')).toEqual({ width: 1600, height: 1200 });
});
