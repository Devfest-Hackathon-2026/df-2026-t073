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
  /** Neighborhood, e.g. "Koenji". */
  area: string;
  lat: number;
  lng: number;
  note?: string;
  address?: string;
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
  /** Null when the location wasn't known at catch time. */
  lat: number | null;
  lng: number | null;
  /** ISO date-time */
  seenAt: string;
  imageUrl?: string;
}

export type TangoKind = 'word' | 'phrase' | 'object' | 'menu_item';
export type CaptureFormat = 'object' | 'text';
export type ReviewStage = 'flashcard' | 'mcq_photo' | 'mcq' | 'fill';
export type QuestionType =
  | 'flashcard_text'
  | 'flashcard_object'
  | 'mcq_text_reading'
  | 'mcq_text_translate'
  | 'mcq_text_reverse'
  | 'mcq_object_name'
  | 'fill_text_reading'
  | 'fill_text_translate'
  | 'fill_text_reverse'
  | 'fill_object_name';
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

export interface RelatedVocab {
  kanji: string;
  reading: string;
  meaning: string;
  relationNote: string;
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
  relatedVocab?: RelatedVocab[];
  /** One-line explanation shown on detail cards. */
  explanation?: string;
  /** Marked by the user; reviewable as "Favourites". */
  favorite?: boolean;
  /** Current review stage (flashcard -> mcq_photo -> mcq -> fill), set by the server. */
  stage: ReviewStage;
  captureFormat?: CaptureFormat;
}

/** A user-made review list. */
export interface TangoList {
  id: string;
  name: string;
  tangoIds: string[];
}

export interface MapPin {
  id: string;
  label: string;
  count: number;
  /** Position on the placeholder map, 0 to 1. */
  x: number;
  y: number;
  /** Real position, for the Google map. */
  lat: number;
  lng: number;
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
  planPlaceId: string | null;
}

/** Today's word, picked for the user's level and interests. */
export interface WordOfDay {
  text: string;
  reading: string;
  romaji: string;
  meaning: string;
  /** Why this word, e.g. "For your visit to 麺屋たいき". */
  reason: string;
}

export interface TodaySummary {
  userName: string;
  upNext: Visit | null;
  pins: MapPin[];
  areas: MapArea[];
  starterTango: JpText[];
  wordOfDay: WordOfDay | null;
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

/** A word worth knowing for a visit; links to Tango detail when the user has it. */
export type BriefingTango = JpText & { tangoId: string | null };

export interface PrepareBriefing {
  place: Place;
  steps: string[];
  tango: BriefingTango[];
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
  /** User turns only: replies to pick from when the user can't speak. */
  choices?: ReplyChoice[];
}

export interface Suggestion {
  jp: JpText;
  why: string;
}

export interface ReplyChoice {
  jp: JpText;
  en: string;
  ok: boolean;
  label: string;
  note: string;
  suggestion?: Suggestion;
}

/** How one reply was rated (spoken or chosen). */
export interface TurnAnswer {
  said: JpText;
  spoken: boolean;
  ok: boolean;
  label: string;
  note: string;
  suggestion?: Suggestion;
}

export interface RehearsalScript {
  /** Null for mock rehearsals. Answers and results are keyed by it. */
  rehearsalId: string | null;
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
  isFavorites?: boolean;
  /** A user-made list; its id is "list:<listId>". */
  isList?: boolean;
}

export interface ReviewSummary {
  dueCount: number;
  minutes: number;
  placeCueCount: number;
  collections: Collection[];
  exerciseTypes: { id: string; label: string; enabled: boolean; count?: number }[];
  totalTango: number;
}

export interface PhotoLayer {
  imageUrl?: string;
  box: NormalizedBox;
  caption: string;
  /** Optional sign text lines for mock-mode photos without an imageUrl. */
  lines?: string[];
}

export interface FlashcardExercise {
  id: string;
  type: 'flashcard';
  questionType: 'flashcard_text' | 'flashcard_object';
  stage: ReviewStage;
  tangoId: string;
  photo: PhotoLayer | null;
  front: JpText | null;
  back: {
    text: string;
    reading: string;
    romaji: string;
    meaning: string;
    example?: JpText & { en: string };
  };
  placeHint: string;
  nextStep: string;
  promotedTo?: ReviewStage | null;
  demotedTo?: ReviewStage | null;
}

export interface McqExercise {
  id: string;
  type: 'mcq';
  questionType:
    | 'mcq_text_reading'
    | 'mcq_text_translate'
    | 'mcq_text_reverse'
    | 'mcq_object_name';
  stage: ReviewStage;
  tangoId: string;
  photo: PhotoLayer | null;
  promptKind: 'jp' | 'meaning' | 'photo';
  prompt: JpText;
  meaningPrompt: string;
  options: (JpText | string)[];
  answerIndex: number;
  placeHint: string;
  example?: JpText & { en: string };
  nextStep: string;
  promotedTo?: ReviewStage | null;
  demotedTo?: ReviewStage | null;
}

export interface FillBlankExercise {
  id: string;
  type: 'fill';
  questionType:
    | 'fill_text_reading'
    | 'fill_text_translate'
    | 'fill_text_reverse'
    | 'fill_object_name';
  stage: ReviewStage;
  tangoId: string;
  photo: PhotoLayer | null;
  prompt: JpText;
  meaningPrompt: string;
  cloze?: JpText & { en: string };
  answerKind: 'kana' | 'meaning';
  acceptedAnswers: string[];
  answerDisplay: string;
  placeHint: string;
  example?: JpText & { en: string };
  nextStep: string;
  promotedTo?: ReviewStage | null;
  demotedTo?: ReviewStage | null;
}

export type Exercise =
  | FlashcardExercise
  | McqExercise
  | FillBlankExercise;

export interface ReviewSession {
  /** Null for mock sessions. Answers are recorded against it. */
  sessionId: string | null;
  exercises: Exercise[];
}

export interface SessionResult {
  reviewed: number;
  minutes: number;
  /** Null when no answer moved a Tango up. */
  biggestWin: { tango: JpText; title: string; detail: string } | null;
  byArea: { area: string; count: number }[];
  /** Next planned visit; null until visits exist on the backend. */
  next: {
    label: string;
    placeId: string;
    placeName: JpText;
    day: string;
  } | null;
}

export interface HomeArea {
  label: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface UserProfile {
  name: string;
  levelNote: string;
  readingLevel?: ReadingLevel | null;
  /** Pins inside it are never placed (privacy promise). */
  homeArea?: HomeArea | null;
  stats: { tango: number; stars: number; places: number };
}

export interface ProfileUpdate {
  name?: string;
  readingLevel?: ReadingLevel;
  homeArea?: HomeArea;
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
  /** Map tab, map cards and every use of location. Off = no GPS at all. */
  mapFeatures: boolean;
}
