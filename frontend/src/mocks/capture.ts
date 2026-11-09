import type {
  CatchEntry,
  Detection,
  JpText,
  SelectionReading,
  Vertex,
} from '../types';
import { TANGO } from './tango';

/** Builds a 4-corner bounding box from a normalized rectangle. */
function box(x: number, y: number, w: number, h: number): Vertex[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function detection(
  tangoId: string,
  itemType: 'text' | 'object',
  sourceLabel: string,
  rect: [number, number, number, number],
): Detection {
  const t = TANGO[tangoId];
  return {
    item_id: `det-${tangoId}`,
    item_type: itemType,
    source_label: sourceLabel,
    japanese_text: t.text,
    reading: t.reading,
    english_gloss: t.meaning,
    confidence: 0.92,
    bounding_box: box(...rect),
    known: t.known,
    tangoId,
  };
}

export interface MockDetectorStep {
  items: Detection[];
  centeredId: string | null;
  hint: string;
  /** How long this step lasts. The last step holds. */
  ms: number;
}

const bento = detection('bento', 'text', 'bento label', [0.12, 0.5, 0.2, 0.06]);
const hangakuOff = detection('hangaku', 'text', 'half price sticker', [0.58, 0.26, 0.26, 0.14]);
const hangakuCenter = detection('hangaku', 'text', 'half price sticker', [0.37, 0.36, 0.26, 0.14]);

const nestBox = detection('penguin', 'object', 'nest box', [0.08, 0.42, 0.18, 0.08]);
nestBox.item_id = 'det-nest-box';
nestBox.japanese_text = '巣箱';
nestBox.reading = 'すばこ';
nestBox.english_gloss = 'nest box';
nestBox.tangoId = undefined;
const penguinOff = detection('penguin', 'object', 'penguin', [0.5, 0.3, 0.3, 0.34]);
const penguinCenter = detection('penguin', 'object', 'penguin', [0.35, 0.3, 0.3, 0.34]);

export const MOCK_DETECTOR_STEPS: Record<'text' | 'objects', MockDetectorStep[]> = {
  text: [
    {
      items: [],
      centeredId: null,
      hint: 'No text detected yet. Take a photo to select text to catch.',
      ms: 2500,
    },
    {
      items: [bento, hangakuOff],
      centeredId: null,
      hint: 'Text detected and highlighted. Take a photo to select it.',
      ms: 2000,
    },
    {
      items: [bento, hangakuCenter],
      centeredId: hangakuCenter.item_id,
      hint: 'Text detected and highlighted. Take a photo to select it.',
      ms: 0,
    },
  ],
  objects: [
    {
      items: [],
      centeredId: null,
      hint: 'Objects mode: center a thing to catch it.',
      ms: 1500,
    },
    {
      items: [nestBox, penguinOff],
      centeredId: null,
      hint: 'New Tango spotted. Bring it to the center to catch it.',
      ms: 1800,
    },
    {
      items: [nestBox, penguinCenter],
      centeredId: penguinCenter.item_id,
      hint: 'Centered and steady, so the shutter became Catch.',
      ms: 0,
    },
  ],
};

export const CURRENT_PLACE_NAME = 'Supermarket, Nakano';

/** Today's catches. Mutated by the mock capture API so the list stays in sync. */
export const todaysCatch: CatchEntry[] = [
  { tango: TANGO['tachiiri-kinshi'], placeName: 'Station north exit', status: 'new' },
  { tango: TANGO.igai, placeName: 'Station north exit', status: 'reviewed' },
  { tango: TANGO.kaedama, placeName: '麺屋 たいき', status: 'new' },
];

const related: JpText[] = [
  { text: 'お早めに', reading: 'おはやめに', romaji: 'ohayame ni', meaning: 'soon' },
  { text: '召し上がる', reading: 'めしあがる', romaji: 'meshiagaru', meaning: 'eat (polite)' },
];

export const SELECTION_READING: SelectionReading = {
  tango: TANGO['mikiri-hin'],
  explanation:
    'Marked-down goods, usually close to their best-before date. The small line says "Please eat soon."',
  related,
};

/** Text drawn on the frozen frame when there's no real photo (e.g. emulator). */
export const PLACEHOLDER_PHOTO_LINES = ['見切り品', 'お早めにお召し上がりください'];
