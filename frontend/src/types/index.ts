// Shared domain types. Field names are camelCase on the frontend; the API
// layer converts backend (snake_case) responses into these shapes.

/** A piece of Japanese with the extra forms <Jp> needs to display it. */
export interface JpText {
  text: string;
  reading?: string;
  romaji?: string;
  meaning?: string;
}

export interface Place {
  id: string;
  name: JpText;
  category: string;
  area: 'Koenji' | 'Nakano' | 'Asagaya' | 'Oshiage';
  lat: number;
  lng: number;
  note?: string;
}

export interface Visit {
  id: string;
  place: Place;
  /** ISO date-time */
  when: string;
  tangoCount: number;
}

export interface Sighting {
  placeId: string;
  placeName: string;
  lat: number;
  lng: number;
  /** ISO date-time */
  seenAt: string;
  imageUrl?: string;
}

export type TangoKind = 'word' | 'phrase' | 'object' | 'menu_item';
export type Strength = 0 | 1 | 2 | 3 | 4;

export interface TangoEvent {
  type: 'caught' | 'reviewed' | 'seen_again';
  label: string;
  detail: string;
  /** e.g. "+1" or "New" */
  badge: string;
}

export interface TangoExample {
  register: 'easy' | 'keigo';
  jp: JpText;
}

export interface Tango {
  id: string;
  kind: TangoKind;
  text: string;
  reading: string;
  romaji: string;
  meaning: string;
  sightings: Sighting[];
  strength: Strength;
  known: boolean;
  history: TangoEvent[];
  examples: TangoExample[];
  /** One-line explanation shown on detail cards. */
  explanation?: string;
}

export interface MapPin {
  id: string;
  label: string;
  count: number;
  /** Position on the placeholder map, 0 to 1. */
  x: number;
  y: number;
  kind: 'tango' | 'next' | 'me';
  /** Area this pin belongs to (opens the area card on the full map). */
  areaId?: string;
  /** Mastered Tango here; shown with the "Stars" map filter. */
  stars?: number;
}

/** Card shown when a pin is tapped on the full map ("Around Koenji"). */
export interface MapArea {
  id: string;
  label: string;
  tangoCount: number;
  placeCount: number;
  sample: Tango[];
  moreCount: number;
  /** Place to plan a visit to from this area. */
  planPlaceId: string;
}

export interface TodaySummary {
  userName: string;
  upNext: Visit | null;
  pins: MapPin[];
  areas: MapArea[];
  starterTango: JpText[];
}

export interface ReviewCard {
  dueCount: number;
  minutes: number;
  areas: string[];
  sample: Tango[];
  moreCount: number;
}

export interface HistoryTip {
  id: string;
  quote: string;
  learners: number;
  when: string;
  inRehearsal: boolean;
}

export interface PrepareBriefing {
  place: Place;
  steps: string[];
  tango: Tango[];
  tips: HistoryTip[];
  source: string;
}

export interface Naturalness {
  ok: boolean;
  label: string;
}

export interface RehearsalTurn {
  id: string;
  speaker: 'staff' | 'user';
  jp: JpText;
  en: string;
  /** User turns only: how the scripted reply was rated. */
  naturalness?: Naturalness;
  /** User turns only: help shown by "Need a hint?". */
  hint?: { explanation: string; model: JpText; modelEn: string };
}

export interface RehearsalScript {
  place: Place;
  staffVoice: string;
  turns: RehearsalTurn[];
}

export interface RehearsalLineResult {
  staff: JpText;
  said: JpText;
  ok: boolean;
  note: string;
  suggestion?: { jp: JpText; why: string };
}

export interface RehearsalResult {
  place: Place;
  lines: RehearsalLineResult[];
}

/** Normalized point, 0 to 1. Matches the backend `Vertex` schema. */
export interface Vertex {
  x: number;
  y: number;
}

/** Matches the backend `DetectedItem` schema (app/schemas/capture.py). */
export interface DetectedItem {
  item_id: string;
  item_type: 'object' | 'text';
  source_label: string;
  japanese_text: string;
  reading: string | null;
  english_gloss: string | null;
  confidence: number | null;
  bounding_box: Vertex[];
}

/** A detection plus what the app knows about it. */
export interface Detection extends DetectedItem {
  known: boolean;
  tangoId?: string;
}

export interface CatchEntry {
  tango: Tango;
  placeName: string;
  status: 'new' | 'reviewed';
}

export interface SelectionReading {
  tango: Tango;
  explanation: string;
  related: JpText[];
}

/** A rectangle in normalized coordinates, 0 to 1. */
export interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Collection {
  id: string;
  label: string;
  count: number;
  isPlace: boolean;
  isPlaceCue: boolean;
}

export interface ReviewSummary {
  dueCount: number;
  minutes: number;
  placeCueCount: number;
  collections: Collection[];
  exerciseTypes: { id: string; label: string; enabled: boolean }[];
  totalTango: number;
}

export interface MultipleChoiceExercise {
  id: string;
  type: 'multiple_choice';
  tangoId: string;
  prompt: JpText;
  options: string[];
  answerIndex: number;
  placeHint: string;
  example: JpText & { en: string };
  nextStep: string;
}

export interface FillGapExercise {
  id: string;
  type: 'fill_gap';
  tangoId: string;
  /** Photo the learner took. Placeholder text is drawn when imageUrl is missing. */
  photo: { imageUrl?: string; caption: string; lines: string[] };
  gap: NormalizedBox;
  options: JpText[];
  answerIndex: number;
  note: string;
}

export type Exercise = MultipleChoiceExercise | FillGapExercise;

export interface SessionResult {
  reviewed: number;
  minutes: number;
  biggestWin: { tango: JpText; title: string; detail: string };
  byArea: { area: string; count: number }[];
  next: { label: string; placeId: string; placeName: JpText; day: string };
}

export interface UserProfile {
  name: string;
  levelNote: string;
  stats: { tango: number; stars: number; places: number };
}

export type ShowJapaneseAs = 'kanji' | 'hiragana' | 'romaji';
export type AppJapanese = 'little' | 'some' | 'lot';
export type ReadingLevel = 'none' | 'kana' | 'some_kanji' | 'most';

export interface Settings {
  showJapaneseAs: ShowJapaneseAs;
  furigana: boolean;
  appJapanese: AppJapanese;
  englishAfterRoleplayLine: boolean;
  staffSpeed: 'slower' | 'natural';
  phrasesFirst: 'easy' | 'keigo';
  explanationsLanguage: string;
  readingLevel: ReadingLevel;
  locationAllowed: boolean;
  /** First-run flow finished. */
  onboarded: boolean;
  /** Show the day-one checklist on Today. */
  dayOne: boolean;
}
