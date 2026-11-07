import type {
  Exercise,
  JpText,
  ReviewCard,
  ReviewSummary,
  SessionResult,
} from '../types';
import { ALL_TANGO, TANGO } from './tango';

export const REVIEW_CARD: ReviewCard = {
  dueCount: 14,
  minutes: 5,
  areas: ['Koenji', 'Nakano', 'Asagaya'],
  sample: [TANGO.shokken, TANGO.katame, TANGO.kaedama, TANGO['churin-kinshi']],
  moreCount: 10,
};

export const REVIEW_SUMMARY: ReviewSummary = {
  dueCount: 14,
  minutes: 5,
  placeCueCount: 1,
  collections: [
    { id: 'koenji', label: 'Koenji', count: 12, isPlace: true, isPlaceCue: false },
    { id: 'clinic', label: 'Clinic visit', count: 6, isPlace: false, isPlaceCue: false },
    { id: 'signs', label: 'Signs', count: 5, isPlace: false, isPlaceCue: false },
    { id: 'place-cue', label: 'Place cue', count: 1, isPlace: false, isPlaceCue: true },
  ],
  exerciseTypes: [
    { id: 'multiple_choice', label: 'Multiple choice', enabled: true },
    { id: 'type_it', label: 'Type it', enabled: true },
    { id: 'say_it', label: 'Say it', enabled: true },
    { id: 'listening', label: 'Listening', enabled: false },
  ],
  totalTango: ALL_TANGO.length,
};

const jp = (text: string, reading: string, romaji: string): JpText => ({
  text,
  reading,
  romaji,
});

export const SESSION: Exercise[] = [
  {
    id: 'ex-1',
    type: 'multiple_choice',
    tangoId: 'shokken',
    prompt: jp('食券', 'しょっけん', 'shokken'),
    options: ['meal ticket', 'receipt', 'set menu', 'food voucher'],
    answerIndex: 0,
    placeHint: 'You saved this at 麺屋 たいき, Koenji.',
    example: {
      ...jp('食券をお願いします。', 'しょっけんをおねがいします。', 'shokken o onegai shimasu.'),
      en: 'Your meal ticket, please.',
    },
    nextStep: "Next time you'll type this one instead of choosing it.",
  },
  {
    id: 'ex-2',
    type: 'fill_gap',
    tangoId: 'tachiiri-kinshi',
    photo: {
      caption: 'The sign you caught at Koenji Station, North Exit · Mon',
      lines: ['教職員以外', '', 'FACULTY/STAFF ONLY'],
    },
    gap: { x: 0.3, y: 0.42, w: 0.4, h: 0.16 },
    options: [
      jp('立入禁止', 'たちいりきんし', 'tachiiri kinshi'),
      jp('駐輪禁止', 'ちゅうりんきんし', 'chūrin kinshi'),
      jp('通行止め', 'つうこうどめ', 'tsūkōdome'),
      jp('営業中', 'えいぎょうちゅう', 'eigyōchū'),
    ],
    answerIndex: 0,
    note: 'Gemini read the rest of the sign and picked look-alike choices you have also seen nearby. (mock)',
  },
  {
    id: 'ex-3',
    type: 'multiple_choice',
    tangoId: 'kaedama',
    prompt: jp('替え玉', 'かえだま', 'kaedama'),
    options: ['extra topping', 'noodle refill', 'large bowl', 'side rice'],
    answerIndex: 1,
    placeHint: 'You saved this at 麺屋 たいき, Koenji.',
    example: {
      ...jp('替え玉、お願いします。', 'かえだま、おねがいします。', 'kaedama, onegai shimasu.'),
      en: 'An extra noodle refill, please.',
    },
    nextStep: 'This one is now a star on your map.',
  },
];

export const SESSION_RESULT: SessionResult = {
  reviewed: 14,
  minutes: 5,
  biggestWin: {
    tango: { text: '替え玉', reading: 'かえだま', romaji: 'kaedama', meaning: 'noodle refill' },
    title: 'finally stuck',
    detail: "Remembered for the first time after the place cue. It's now a star on your map.",
  },
  byArea: [
    { area: 'Koenji', count: 8 },
    { area: 'Nakano', count: 4 },
    { area: 'Asagaya', count: 2 },
  ],
  next: {
    label: 'Next, you will prepare for',
    placeId: 'nakano-ward-office',
    placeName: { text: '中野区役所', reading: 'なかのくやくしょ', romaji: 'nakano kuyakusho', meaning: 'Nakano Ward Office' },
    day: 'Thursday',
  },
};
