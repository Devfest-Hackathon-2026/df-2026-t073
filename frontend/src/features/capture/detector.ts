import { MOCK_DETECTOR_STEPS } from '../../mocks/capture';
import type { Detection, NormalizedBox, Vertex } from '../../types';

// Live detection seam. The camera screen only talks to a `Detector`, so the
// mock below can later be swapped for:
//  - an on-device ML Kit detector (Japanese text recognition + object
//    detection run on VisionCamera frames; the Lens-style live highlights), and
//  - a server read via POST /api/v1/captures (Cloud Vision) or Gemini for
//    the shutter / "Read this" path.
// Detections use the backend's DetectedItem shape (normalized bounding boxes).

export type DetectorMode = 'text' | 'objects';

export interface DetectorFrame {
  items: Detection[];
  /** The detection that sits in the center of the frame, if any. */
  centeredId: string | null;
  /** Coaching line shown above the shutter. */
  hint: string;
}

export const EMPTY_FRAME: DetectorFrame = { items: [], centeredId: null, hint: '' };

export interface Detector {
  /** Starts emitting frames. Returns a function that stops it. */
  start(mode: DetectorMode, onFrame: (frame: DetectorFrame) => void): () => void;
}

/** Plays a scripted sequence: nothing -> spotted off-center -> centered. */
export const mockDetector: Detector = {
  start(mode, onFrame) {
    const steps = MOCK_DETECTOR_STEPS[mode];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let index = 0;
    const run = () => {
      const step = steps[index];
      onFrame({ items: step.items, centeredId: step.centeredId, hint: step.hint });
      if (index < steps.length - 1) {
        timer = setTimeout(() => {
          index += 1;
          run();
        }, step.ms);
      }
    };
    run();
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  },
};

/** Bounding rectangle of a polygon, in normalized coordinates. */
export function boxOf(vertices: Vertex[]): NormalizedBox {
  if (vertices.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
