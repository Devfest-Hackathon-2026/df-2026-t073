import type { DetectedItem, NormalizedBox } from '../../types';
import { boxOf } from './detector';

export interface Size {
  width: number;
  height: number;
}

/** A box in screen pixels. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a box on the photo lands on screen when the photo fills the view
 * with resizeMode="cover" (scaled up, centered, edges cropped).
 */
export function coverRect(
  box: NormalizedBox,
  photo: Size,
  view: Size,
): ScreenRect {
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const shownW = photo.width * scale;
  const shownH = photo.height * scale;
  const offsetX = (view.width - shownW) / 2;
  const offsetY = (view.height - shownH) / 2;
  return {
    left: offsetX + box.x * shownW,
    top: offsetY + box.y * shownH,
    width: box.w * shownW,
    height: box.h * shownH,
  };
}

/**
 * The reverse of coverRect: which part of the photo (0-1, clamped) is under
 * a box on screen.
 */
export function screenToPhoto(
  rect: ScreenRect,
  photo: Size,
  view: Size,
): NormalizedBox {
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const shownW = photo.width * scale;
  const shownH = photo.height * scale;
  const offsetX = (view.width - shownW) / 2;
  const offsetY = (view.height - shownH) / 2;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x = clamp((rect.left - offsetX) / shownW);
  const y = clamp((rect.top - offsetY) / shownH);
  const right = clamp((rect.left + rect.width - offsetX) / shownW);
  const bottom = clamp((rect.top + rect.height - offsetY) / shownH);
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * The item at a point on screen (default: the center the user aimed with):
 * the smallest box under the point, else the box closest to it. Text wins
 * over objects, since object boxes are large and often cover the sign meant.
 */
export function pickAimed(
  items: DetectedItem[],
  photo: Size,
  view: Size,
  point: { x: number; y: number } = { x: view.width / 2, y: view.height / 2 },
  /** Ignore boxes further than this from the point, in screen pixels. */
  maxDistance: number = Infinity,
): DetectedItem | null {
  const cx = point.x;
  const cy = point.y;
  let best: { item: DetectedItem; score: number } | null = null;
  for (const item of items) {
    if (item.bounding_box.length === 0) {
      continue;
    }
    const r = coverRect(boxOf(item.bounding_box), photo, view);
    const inside =
      cx >= r.left &&
      cx <= r.left + r.width &&
      cy >= r.top &&
      cy <= r.top + r.height;
    const dx = Math.max(r.left - cx, 0, cx - (r.left + r.width));
    const dy = Math.max(r.top - cy, 0, cy - (r.top + r.height));
    if (Math.hypot(dx, dy) > maxDistance) {
      continue;
    }
    // Inside beats outside; then text beats objects; then smaller/closer wins.
    const score =
      (inside ? 0 : 1e9 + Math.hypot(dx, dy) * 1e3) +
      (item.item_type === 'object' ? 1e8 : 0) +
      (inside ? r.width * r.height : 0) / 1e3;
    if (!best || score < best.score) {
      best = { item, score };
    }
  }
  return best?.item ?? null;
}

/** Upright photo size from the camera's raw size and capture rotation. */
export function uprightSize(
  width: number,
  height: number,
  orientation: 'up' | 'right' | 'down' | 'left',
): Size {
  return orientation === 'left' || orientation === 'right'
    ? { width: height, height: width }
    : { width, height };
}
