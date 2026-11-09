/**
 * All user-facing text in the app, in one place. Change wording here.
 *
 * Grouped by screen or feature. Text that includes values is a small function,
 * e.g. `copy.common.play('食券')` -> "Play 食券".
 *
 * Not in here: mock data (src/mocks), route names, ids and storage keys, and
 * errors only developers see (e.g. a hook used outside its provider).
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Word-of-the-day topic names, by the backend's topic id. */
const TOPIC_NAMES: Record<string, string> = {
  food: 'food',
  shopping: 'shopping',
  transport: 'train and bus',
  signs: 'sign',
  lodging: 'hotel and bath',
  sightseeing: 'sightseeing',
  health: 'help',
  greetings: 'everyday',
};

/** How far a Tango is from a Stamp (full strength), e.g. "2 to Stamp". */
function stepsToStamp(n: number): string {
  return n > 0 ? `${n} to Stamp` : 'Hana Stamp earned';
}

const common = {
  close: 'Close',
  back: 'Back',
  cancel: 'Cancel',
  delete: 'Delete',
  save: 'Save',
  done: 'Done',
  new: 'New',
  tango: 'Tango',
  tryAgain: 'Try again',
  couldNotLoad: "Couldn't load this",
  /** Sun..Sat, indexed by Date.getDay(). */
  weekdays: WEEKDAYS,
  /** January..December, indexed by Date.getMonth(). */
  months: MONTHS,
  play: (text: string) => `Play ${text}`,
  // Facts shown side by side with icons (no separators).
  tangoCount: (n: number) => `${n} Tango`,
  placeCount: (n: number) => (n === 1 ? '1 place' : `${n} places`),
  minutes: (n: number) => `${n} min`,
  aboutMinutes: (n: number) => `About ${n} min`,
  open: (text: string) => `Open ${text}`,
  /** Light, upbeat lines shown while something loads. */
  loadingLines: ['Gathering your words…', 'Lining things up…', 'Almost there…'],
};

const strength = {
  a11y: (n: number) => `Strength ${n} of 4`,
  /** Label per strength 0-4. */
  levels: ['New', 'Warming up', 'Warming up', 'Almost there', 'Stamp'],
};

const tabs = {
  today: 'Home',
  map: 'Map',
  plans: 'Plans',
  capture: 'Capture',
  review: 'Tango',
  me: 'Me',
  openCamera: 'Open camera',
};

const map = {
  a11y: 'Map of your Tango',
  goToMyLocation: 'Go to my location',
  /** Glyph on the "up next" pin: 次 = next. */
  nextGlyph: '次',
  /** Glyph on Tango pins: 単 is from 単語 (word). */
  tangoGlyph: '単',
  placeholder: 'Map placeholder',
  placeholderPin: (label: string, count: number | string) =>
    `${label || 'Pin'} ${count || ''}`,
  /** Title of a neighborhood card. */
  around: (area: string) => `Around ${area}`,
  /** Label on the pin for the next planned visit. */
  upNext: 'Up next',
};

const jp = {
  peekHint: 'Shows the meaning, plays it, and lets you save it',
  noMeaning: 'No meaning yet',
};

const saveWord = {
  idle: 'Save as Tango',
  saving: 'Saving…',
  saved: 'Saved to your Tango',
  owned: 'Already in your Tango',
  failed: 'Could not save. Try again',
};

/** "How it grew" events on the Tango page. */
const history = {
  caught: 'Caught',
  seenAgain: 'Seen again with the camera',
  missedInReview: 'Missed in review',
  gotItInReview: 'Got it in review',
};

/** Review stage and question names. */
const reviewLabels = {
  stages: {
    flashcard: 'Flashcard',
    mcq_photo: 'Photo MCQ',
    mcq: 'Multiple choice',
    fill: 'Fill in the blank',
  },
  questionTypes: {
    flashcard_text: 'Flip to reveal the answer',
    flashcard_object: 'Flip to reveal the answer',
    mcq_text_reading: 'Choose the most appropriate answer',
    mcq_text_translate: 'Choose the most appropriate answer',
    mcq_text_reverse: 'Choose the most appropriate answer',
    mcq_object_name: 'Choose the most appropriate answer',
    fill_text_reading: 'Type your answer',
    fill_text_translate: 'Type your answer',
    fill_text_reverse: 'Type your answer',
    fill_object_name: 'Type your answer',
  },
};

/** Error messages people can see. */
const errors = {
  dailyLimit: 'Daily limit reached. Try again tomorrow.',
  requestFailed: (method: string, path: string, status: number) =>
    `${method} ${path} failed with HTTP ${status}`,
  timedOut: 'Request timed out. Please try again.',
  nothingToCatch: 'Nothing to catch.',
  listNotFound: 'List not found',
  noRehearsalSession: 'This rehearsal has no session.',
  authNotConfigured: 'Firebase Authentication is not configured.',
  googleNotConfigured:
    'Google sign-in is not set up. Add GOOGLE_WEB_CLIENT_ID to frontend/.env.',
  googleNoToken: 'Google did not return a sign-in token. Please try again.',
  emailPasswordRequired: 'Email and password are required.',
  testEmailPasswordRequired: 'Test email and password are required.',
  wrongPasswordForExistingUser: 'User exists but with a different password.',
  emailSignInDisabled:
    'Email/Password sign-in is disabled in Firebase Console. Enable it under Authentication > Sign-in method.',
};

const captureToday = {
  loadingLines: ["Counting today's catch…"],
  title: "Today's catch",
  empty: 'Nothing caught yet today.',
  reviewed: 'Reviewed',
};

const plans = {
  title: 'Plans',
  titleJp: { text: '予定', reading: 'よてい', romaji: 'yotei' },
  searchPlaceholder: 'どこへ行く？',
  searchA11y: 'Search places to visit',
  empty: 'No visits planned yet.',
  prepare: 'Prepare',
  // Plan sheet (Prepare, Today)
  sheetTitle: (place: string) => `Plan a visit to ${place}`,
  date: 'Date',
  time: 'Time',
  monthLabel: (month: string, year: number) => `${month} ${year}`,
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  dayA11y: (weekday: string, date: number, month: string) =>
    `${weekday} ${date} ${month}`,
  hour: 'Hour',
  minute: 'Minute',
  earlier: (unit: string) => `Earlier ${unit.toLowerCase()}`,
  later: (unit: string) => `Later ${unit.toLowerCase()}`,
  pickLabel: (weekday: string, date: number, month: string, time: string) =>
    `${weekday} ${date} ${month.slice(0, 3)}, ${time}`,
  pastTime: 'Pick a time later than now.',
  slots: {
    morning: 'Morning',
    lunch: 'Lunch',
    afternoon: 'Afternoon',
    evening: 'Evening',
  },
  slotLabel: (name: string, time: string) => `${name} ${time}`,
  addToPlans: 'Add to plans',
  saveChange: 'Save change',
  planned: 'Planned',
  change: 'Change',
  remove: 'Remove',
  notPlanned: 'Not planned',
  planVisit: 'Plan a visit',
  otherPlace: 'Pick another place',
  couldNotSave: 'Could not save',
};

const rehearseResults = {
  loadingLines: [
    'Looking back at your conversation…',
    'Picking out what went well…',
  ],
  rehearseAgain: 'Rehearse again',
  title: 'Results',
  niceWork: 'Nice work!',
  hintsUsed: (n: number) => `Used ${n} hint${n === 1 ? '' : 's'}`,
  feedbackBy: 'Feedback by Gemini',
  staff: 'Staff:',
  /** Marks for each of your lines: ○ natural, △ could be better. */
  okMark: '○',
  notQuiteMark: '△',
  geminiSuggests: 'Gemini suggests',
  playSuggestion: 'Play suggestion (coming soon)',
  ready: "I'm ready",
  /** Save a line to the Tango in it ("Your sentences" on the Tango page). */
  saveYours: 'Save to Tango',
  saveSuggested: 'Save suggested version',
  savedTo: (words: string[]) => `Saved to ${words.join(', ')}`,
  couldNotSave: 'Could not save. Try again',
};

const allTango = {
  loadingLines: ['Laying out your Tango…'],
  title: 'All Tango',
  searchPlaceholder: 'Search words, meanings or places',
  searchA11y: 'Search Tango or places',
  noMatches: 'No matches',
  filters: {
    all: 'All',
    favorites: 'Favorites',
    learning: 'Learning',
    stamped: 'Stamp',
  },
  sortBy: 'Sort by',
  sorts: {
    newest: 'Newest',
    oldest: 'Oldest',
    weakest: 'Weakest first',
    strongest: 'Strongest first',
    az: 'A–Z',
  },
  sortA11y: (label: string) => `Sort: ${label}`,
  place: 'Place',
  anyPlace: 'Any place',
  list: 'List',
  anyList: 'Any list',
  prevPage: 'Previous page',
  nextPage: 'Next page',
  pageA11y: (n: number) => `Page ${n}`,
};

const lists = {
  couldNotSave: 'Could not save',
  namePlaceholder: 'e.g. Ramen shop words',
  nameA11y: 'List name',
  addToList: 'Add to a list',
  newList: 'New list',
  loadingLines: ['Opening your list…'],
  gone: 'This list no longer exists.',
  deleteTitle: (name: string) => `Delete "${name}"?`,
  deleteBody: 'The Tango themselves stay.',
  reviewThisList: 'Review this list',
  rename: 'Rename list',
  deleteList: 'Delete list',
  count: (n: number) => `${n} Tango`,
  empty: 'Add Tango from their detail page.',
  remove: (text: string) => `Remove ${text}`,
};

/** Tango rows in lists: the first place it was seen. */
const tangoRow = {};

const meSections = {
  profile: 'Profile',
  display: 'Display settings',
  practice: 'Conversation practice settings',
  languages: 'Native language',
  privacy: 'Map and location settings',
  developer: 'Developer',
};

const review = {
  loadingLines: ['Counting what is due…', 'Sorting your collections…'],
  title: 'Tango',
  quickReview: 'Quick review',
  collections: 'Collections',
  nothingCaught: 'Nothing caught yet',
  /** Names of the built-in collections. */
  favorites: 'Favorites',
  placeCue: 'Place cue',
  /** Collection sheet. */
  practice: 'Practice',
  editList: 'Edit list',
  collectionEmpty: 'No Tango here yet',
  /** The Review card when nothing is due. */
  caughtUp: 'All caught up',
  caughtUpBody: 'Tango show up here again when they are due.',
  placeCueAbout:
    'Tango due for review, each asked with the place you saw it as a hint.',
};

const mapScreen = {
  locationUnavailableTitle: 'Location unavailable',
  locationUnavailableBody:
    'Turn on location and allow Tankengo to use it, then try again.',
  searchPlaceholder: 'さあ、旅立とう！',
  searchA11y: 'Search places to visit',
  filterAll: 'All Tango',
  filterStamps: 'Hana Stamp',
  filterPlanned: 'Planned',
  filterFavorites: 'Favorites',
  noPlaces: 'No places found.',
  closeAreaCard: 'Close area card',
  /** Heart on a place (Prepare, search results). */
  favoritePlace: (name: string) => `Favorite ${name}`,
  unfavoritePlace: (name: string) => `Remove ${name} from favorites`,
  reviewThese: 'Review these',
  planVisit: 'Plan a visit',
};

const me = {
  loadingLines: ['Tallying your Tango…', 'Counting your Stamps…'],
  title: 'Me',
  mapOn: 'Map on',
  mapOff: 'Map off',
  statTango: 'Tango',
  statStamps: 'Hana Stamps',
  statPlaces: 'Places',
  logOut: 'Log out of this device',
  editProfile: 'Edit profile',
  /** Under your name, from your reading level. */
  levelNotes: {
    none: 'Just starting, with romaji for now',
    kana: 'Reads hiragana and katakana',
    some_kanji: 'Reads some everyday kanji',
    most: 'Reads most signs and menus',
  },
  levelNotSet: 'Reading level not set yet',
  credits:
    'Dictionary data: JMdict, © Electronic Dictionary Research and Development Group, used under CC BY-SA 4.0.',
};

const prepare = {
  loadingLines: [
    'Reading what visitors say about this place…',
    "Picking the words you'll hear at the counter…",
    'Planning your first moves inside…',
  ],
  rehearse: 'Rehearse with staff',
  rehearseTime: 'About 2 min',
  aiNote: 'AI suggestion from reviews; may be out of date.',
  title: 'Prepare',
  titleJp: { text: '準備', reading: 'じゅんび', romaji: 'junbi' },
  whatToExpect: 'What to expect',
  whatToExpectJp: {
    text: 'お店の流れ',
    reading: 'おみせのながれ',
    romaji: 'omise no nagare',
  },
  tangoForVisit: 'Tango for this visit',
  learnerTips: 'Learner tips',
  firstTime: "It's your first time here. Give it a try!",
  tipsSubtitle: 'Anonymous tips from other learners',
  noTips: 'No tips for this place yet.',
  tipQuote: (quote: string) => `"${quote}"`,
  learners: (n: number) => (n === 1 ? '1 learner' : `${n} learners`),
  inRehearsal: 'In your rehearsal',
};

const rehearse = {
  loadingLines: [
    'Your staff member is getting ready…',
    'Setting the scene…',
    'Warming up the counter…',
  ],
  aiRolePlay: 'AI role-play',
  slower: 'Slower',
  natural: 'Natural',
  couldNotCheck: 'Could not check that reply.',
  noMicrophone: 'No microphone access, so choose a reply instead.',
  recordingUnavailable:
    'Recording is not available here. Choose a reply instead.',
  holdWhileSpeaking: 'Hold the button while you speak.',
  recordingFailed: 'Recording failed. Choose a reply instead.',
  staffAi: 'Staff',
  tapForEnglish: 'Tap to see English',
  playAgain: 'Play again',
  you: 'You',
  spoken: 'Spoken',
  yourTurn: 'Your turn',
  /** Before the English of the reply staff expect; any close reply is fine. */
  sayNext: 'Try saying something like:',
  /** How many of the learner's replies are still to come. */
  repliesLeft: (n: number) =>
    n === 0 ? 'All done' : n === 1 ? 'Last reply' : `${n} replies left`,
  hint: 'Hint',
  needHint: 'Need a hint?',
  seeResults: 'See results',
  holdToSpeak: 'Hold to speak',
  checking: 'Checking your reply…',
  listening: 'Listening… release to send',
  chooseReply: "Can't speak right now? Choose a reply",
};

const tangoDetail = {
  loadingLines: ['Opening your Tango…'],
  unknownPlace: 'Unknown place',
  deleteTitle: 'Delete Tango',
  deleteBody: 'Are you sure you want to delete this word?',
  couldNotDeleteTitle: 'Could not delete',
  couldNotDeleteBody: 'Failed to delete this Tango. Please try again.',
  couldNotExpand: 'Could not generate related vocabulary. Please try again.',
  removeFavorite: 'Remove from favorites',
  favorite: 'Favorite',
  addToList: 'Add to a list',
  deleteTango: 'Delete Tango',
  toStamp: (steps: number) => stepsToStamp(steps),
  phrases: 'Phrases',
  writingPhrases: 'Writing example phrases…',
  noPhrases: 'No example phrases yet',
  registerEasy: 'Easy',
  registerKeigo: 'Keigo',
  history: 'History',
  stage: (label: string) => `Stage: ${label}`,
  relatedVocab: 'Related vocabulary',
  gemini: 'Gemini',
  generatingRelated: 'Generating related words…',
  expandRelated: 'Expand with related vocabulary',
  whereYouSawIt: 'Where you saw it',
  yourSentences: 'Your sentences',
  sentenceKind: (kind: 'yours' | 'suggested') =>
    kind === 'yours' ? 'You said' : 'Suggested',
  removeSentence: (text: string) => `Remove "${text}"`,
  timesSeen: (n: number) => `${n}×`,
};

const welcome = {
  readingLevels: {
    none: { title: 'Not yet', help: 'Romaji and English help everywhere' },
    kana: { title: 'Hiragana and katakana', help: 'Furigana on every kanji' },
    some_kanji: {
      title: 'Some everyday kanji',
      help: 'Furigana only on new kanji',
    },
    most: {
      title: 'Most signs and menus',
      help: 'Japanese first, help on request',
    },
  },
  privacy: {
    pins: {
      title: 'Only you see your pins',
      body: 'No profile, no followers, nothing public.',
    },
    home: {
      title: 'Home stays blank',
      body: "Pins near where you live are never placed. You pick the area once; we don't guess it.",
    },
    tips: {
      title: 'Tips you share are anonymous',
      body: 'Only the tip and the shop. No name, no account, no exact time.',
    },
  },
  continue: 'Continue',
  allowLocation: 'Allow location while using the app',
  notNow: 'Not now, use the camera without places',
  readTitle: 'What can you read so far?',
  readBody:
    "Just a starting point. Tankengo adjusts as you catch and review, so there's no wrong answer.",
  explanationsIn: (language: string) =>
    `Explanations are in ${language}. You can change this later in Me.`,
  mapTitle: 'Your map stays yours',
  mapBody:
    "Location lets each Tango remember where you found it. Here's what that means.",
};

const login = {
  unknownError: 'An unknown error occurred.',
  wrongCredentials: 'Incorrect email or password. Please try again.',
  emailInUse:
    'An account with this email already exists. Please sign in instead.',
  weakPassword: 'Password should be at least 6 characters.',
  invalidEmail: 'Please enter a valid email address.',
  signInDisabled: 'Email/Password sign-in is not enabled in Firebase Console.',
  networkFailed:
    'Network request failed. Please check your internet connection.',
  missingFields: 'Please enter both email and password.',
  badge: 'Tangoをキャッチする',
  welcomeBack: 'Welcome back',
  createAccountTitle: 'Create an account',
  signInBody: 'Sign in to access your saved words, places, and study progress.',
  signUpBody: 'Sign up to keep your vocabulary synchronized across devices.',
  email: 'Email address',
  emailPlaceholder: 'name@example.com',
  password: 'Password',
  passwordPlaceholder: 'Password (minimum 6 characters)',
  signingIn: 'Signing in…',
  signIn: 'Sign in',
  createAccount: 'Create account',
  toSignUp: "Don't have an account? Create one",
  toSignIn: 'Already have an account? Sign in',
  continueWithGoogle: 'Continue with Google',
  or: 'or',
  googlePlayServices:
    'Google Play services is missing or out of date on this device.',
  accountExistsOtherMethod:
    'An account with this email already exists with a different sign-in method.',
};

const today = {
  title: 'Home',
  loadingLines: [
    "Gathering today's words…",
    "Checking what's due…",
    'Choosing your word of the day…',
  ],
  greeting: {
    text: 'こんにちは',
    reading: 'こんにちは',
    romaji: 'konnichiwa',
    meaning: 'Hello',
  },
  /** After the greeting, outside its underline. */
  greetingComma: { text: '、', reading: '、', romaji: ',' },
  nameSan: (name: string) => ({
    text: `${name}さん`,
    romaji: `${name}-san`,
    meaning: `${name} (with the polite さん)`,
  }),
  statTango: 'Tango',
  statToReview: 'to review',
  statAreas: (n: number) => (n === 1 ? 'area' : 'areas'),
  neighborhoods: 'Your neighborhoods',
  neighborhoodsJp: { text: '近所', reading: 'きんじょ', romaji: 'kinjo' },
  /** Separates the sample words on a neighborhood card. */
  sampleSeparator: '・',
  openMap: 'Open your Tango map',
  tangoMap: 'Your Tango map',
  explore: 'Explore',
  upNext: 'Up next',
  prepare: 'Prepare',
  allPlans: 'All plans',
  planVisit: 'Plan a visit',
  yourPlans: 'Your plans',
  nothingPlanned: 'Nothing planned yet',
  wordOfDay: "Today's Tango",
  /** Why this word of the day was picked. */
  wordReason: {
    visit: (place: string) => `For your visit to ${place}`,
    /** `topicId` is the backend's topic, e.g. "food". */
    topic: (topicId: string) =>
      `You've been catching ${TOPIC_NAMES[topicId] ?? topicId} words`,
    everyday: 'An everyday word for your level',
  },
  reviewTitle: 'Review',
  start: 'Start',
  more: (n: number) => `+${n} more`,
  firstOuting: 'Your first outing',
  dismissFirstOuting: 'Dismiss first outing card',
  aboutTenMin: 'About 10 min',
  stepCatch: 'Catch 3 Tango around the station',
  stepRehearse: 'Rehearse buying a ticket',
  stepRehearseNote: '1 min with Gemini, at your own pace',
  go: 'Go',
  stepReview: 'Your first review tonight',
  stepReviewNote: 'Opens after you catch 3',
  starterTango: "Tango you'll likely see around Koenji Station",
};

const reviewSession = {
  loadingLines: ['Picking your weakest Tango…', 'Setting up your questions…'],
  nothingDue: 'Nothing due right now.',
  endReview: 'End review',
  hintButton: 'Where did I see this Tango?',
  continue: 'Continue',
  /** Toast after rating a flashcard. */
  toast: {
    levelUp: (word: string) => `Level up for ${word}!`,
    stronger: (word: string) => `${word} is getting stronger`,
    backAStep: (word: string) => `Back a step for ${word}`,
    comeBackSoon: (word: string) => `${word} will come back soon`,
    stale: "Didn't count: practiced elsewhere",
  },
  photoA11y: 'Your capture photo with the target highlighted',
  yourPhoto: 'Your photo',
  noPlace: 'No place saved',
  flashcardTextPrompt: 'Do you remember how to read and translate this?',
  flashcardObjectPrompt: 'Do you remember the Japanese word for this object?',
  flip: 'Flip card',
  howWell: 'How well did you know it?',
  again: 'Again',
  good: 'Good',
  easy: 'Easy',
  mcqHeading: {
    reading: 'How do you read this?',
    translatePhoto: 'What does the highlighted text mean?',
    translate: 'What does this mean?',
    reverse: 'How do you say this in Japanese?',
    objectName: 'What is this called in Japanese?',
  },
  /** What to type (read out by screen readers as the input's label). */
  fillInstruction: {
    fill_text_reading: 'Type the reading in kana',
    fill_text_translate: 'Type the meaning',
    fill_text_reverse: 'Type the Japanese word (kanji or kana)',
    fill_object_name: 'Type the Japanese name for this object (kanji or kana)',
  },
  typePlaceholder: 'Type your answer here',
  keyboardKana: 'Use a Japanese keyboard. Hiragana and katakana both count.',
  keyboardKanjiOrKana:
    'Use a Japanese keyboard. Kanji or kana both count, but not romaji.',
  answerInKana: 'Please answer in kana',
  showAnswer: 'Show answer',
  check: 'Check',
  flashcardAnswer: (text: string, reading: string) =>
    reading && reading !== text ? `${text} (${reading})` : text,
  revealed: "Here's the answer",
  correct: 'Correct!',
  wrong: 'Not quite',
  theAnswerWas: (answer: string) => `The answer was “${answer}”.`,
  alsoAccepted: (synonyms: string) => `Also accepted: ${synonyms}`,
  stale:
    "This one didn't count: you practiced this Tango elsewhere since starting.",
  levelUp: 'Level up!',
  backAStep: 'Back a step',
  /** Shown after a right answer: how far the Tango is from a Stamp. */
  stepsToStamp,
};

const sessionResults = {
  excellent: 'Excellent work!',
  reviewed: (n: number) => `${n} Tango reviewed`,
  /** Heading over the Tango that grew most this session. */
  biggestWin: 'Most improved Tango',
  /** e.g. "1 to Stamp" or "Stamp earned". */
  winDetail: (strengthAfter: number) => stepsToStamp(4 - strengthAfter),
  practiced: 'Tango practiced',
  tangoCount: (n: number) => `${n} Tango`,
  /** The next planned visit, in one line. */
  nextPlan: 'Your next plan',
  backToToday: 'Back to Today',
  prepareNext: 'Prepare next',
};

const capture = {
  /**
   * Place pill text when there is no real place. The backend also ignores these
   * names in older data (PLACEHOLDER_PLACE_NAMES in backend/app/services/tango_rules.py),
   * so update that list too if you rename them.
   */
  placeFinding: 'Finding your place…',
  placeUnknown: 'Unknown place',
  placeLocationOff: 'Location off',
  placeNearYou: 'Near you',
  liveHint: {
    text: 'Aim at a Japanese word',
    objects: 'Aim at an object',
  },
  centerAWord: 'Center a word to catch it.',
  somethingWrong: 'Something went wrong',
  caughtHere: 'caught here',
  seenAgainHere: 'seen again, added here',
  savedPinnedHere: 'saved, pinned here',
  noTextFound:
    'No Japanese text here. Try again closer, or with the text straight on.',
  noObjectFound:
    'No object recognized here. Try again with it filling the frame.',
  noCamera: 'No camera available. Use the photo import button instead.',
  couldNotReadPhoto: 'Could not read that photo.',
  recognizedYes: 'nice. Review pushed later.',
  recognizedNo: 'okay. It will come back sooner.',
  noPreview:
    'Camera preview unavailable (no camera or no permission). Mock detection still runs.',
  allowCamera: 'Allow camera',
  lookUp: (text: string) => `Look up ${text}`,
  youKnowThis: 'You know this',
  saved: 'Saved',
  newTango: 'New Tango',
  frozenA11y: 'Tap what you want to catch, or drag across words to join them',
  closeCamera: 'Close camera',
  caughtToday: (n: number) => `${n} caught today. Open today's catch`,
  photoReading: 'Reading the photo…',
  photoFound: (n: number) => `${n} found in this photo`,
  photoNothing: 'Nothing found in this photo',
  details: 'Details',
  undo: 'Undo',
  tapToDismiss: (error: string) => `${error} (tap to dismiss)`,
  partsJoined: (n: number) => `${n} parts joined`,
  objectTag: 'Object',
  pickOrJoin: 'tap a box to pick it, or drag across boxes to join them',
  pick: 'tap a box to pick it',
  retake: 'Retake',
  reading: 'Reading…',
  catch: 'Catch',
  saving: 'Saving…',
  dragBox:
    'Drag the box around what you want, and the corner to resize. Handwriting, odd fonts and blurry signs all work.',
  readThis: 'Read this',
  modeText: 'Text',
  modeObjects: 'Objects',
  importPhotos: 'Import from photos',
  caught: 'Caught!',
  catchWord: (text: string) => `Catch ${text}`,
  shutter: 'Shutter',
  explainedBy: 'Explained by Gemini',
  waysToHear: 'Ways you might hear it',
  registerEasy: 'Easy',
  registerKeigo: 'Keigo',
  practice: 'Practice',
  saveTango: 'Save Tango',
  learned: "You've learned this one",
  firstSaved: (where: string, timesSeen: number) =>
    `First saved: ${where}. You've seen it ${timesSeen} times since.`,
  unknown: 'unknown',
  recognizeQuestion: 'Did you recognize this Tango?',
  notReally: 'Not really',
  yes: 'Yes',
  tailorNote: "We'll tailor your review schedule based on your answer.",
  foundInPhoto: 'Found in this photo',
  nothingReadable:
    'Nothing readable was found. Try again closer, or with the text straight on.',
  geminiRead: 'Gemini read your selection',
  adjustBox: 'Not quite? Adjust the box',
  selectionBoxA11y: 'Selection box. Drag to move, drag the corner to resize.',
};

/** Me > settings sections. */
const settings = {
  couldNotSave: 'Could not save',
  name: 'Name',
  nameA11y: 'Your name',
  readingLevel: 'Reading level',
  account: 'Account',
  signedInAs: (email: string) => `Signed in as ${email}`,
  signedInGuest: 'Signed in as Guest (Anonymous)',
  signedIn: 'Signed in',
  uid: (uid: string) => `UID: ${uid}`,
  logOut: 'Log out of this device',
  homeArea: 'Home area',
  notSet: 'Not set',
  homeRadius: (meters: number) => `Nothing within ${meters} m is pinned`,
  cancel: 'Cancel',
  change: 'Change',
  set: 'Set',
  homeSearchPlaceholder: 'A station or place near home',
  homeSearchA11y: 'Search for your home area',
  showJapaneseAs: 'Show Japanese as',
  kanji: 'Kanji',
  hiragana: 'Hiragana',
  romaji: 'Romaji',
  furigana: 'Furigana over kanji',
  /** Live previews at the top of the display and practice settings. */
  preview: {
    word: {
      text: '食券',
      reading: 'しょっけん',
      romaji: 'shokken',
      meaning: 'meal ticket',
    },
    /** Section titles: Japanese from "Some" / from "A lot" of Japanese in the app. */
    titleSome: {
      en: 'Prepare',
      jp: { text: '準備', reading: 'じゅんび', romaji: 'junbi' },
    },
    titleLot: {
      en: 'Review',
      jp: { text: '復習', reading: 'ふくしゅう', romaji: 'fukushū' },
    },
    staffLine: {
      text: 'いらっしゃいませ。食券をお願いします。',
      reading: 'いらっしゃいませ。しょっけんをおねがいします。',
      romaji: 'irasshaimase. shokken o onegai shimasu.',
    },
    staffEnglish: 'Welcome. Your meal ticket, please.',
    playStaff: 'Play the staff line',
    phrases: {
      easy: {
        text: '食券ください。',
        reading: 'しょっけんください。',
        romaji: 'shokken kudasai.',
      },
      keigo: {
        text: '食券をお願いいたします。',
        reading: 'しょっけんをおねがいいたします。',
        romaji: 'shokken o onegai itashimasu.',
      },
    },
  },
  japaneseInApp: 'Japanese in the app',
  aLittle: 'A little',
  some: 'Some',
  aLot: 'A lot',
  staffSpeed: 'Staff speaking speed',
  slower: 'Slower',
  natural: 'Natural',
  phrasesFirst: 'Phrases shown first',
  easy: 'Easy',
  keigo: 'Keigo',
  englishAfterLine: 'English after each role-play line',
  /** Under the language list. */
  languageFooter: 'Meanings, hints and feedback are shown in this language.',
  mapAndLocation: 'Map and location',
  mapOn: 'On',
  mapOff: 'Off: no map, and Tankengo never reads your location',
  howLocationIsUsed: 'How your location is used',
  locationUses: {
    pins: 'Pins each Tango to the place you caught it, so reviews can remind you where you saw it.',
    search:
      'Finds places near you when you search, and centers the map on you.',
    home: 'Your home area is never pinned or shown on the map.',
    sharing:
      "Your locations aren't shared with other learners. Shared tips carry only the tip and the place.",
    foreground:
      'Location is read only while you use the app, never in the background.',
  },
  locationFooter:
    "Saved locations stay in your account. You can turn the map and location off at any time; catches made while it's off have no place.",
};

/** Me > Developer (test account only). */
const developer = {
  notChecked: 'Not checked',
  checking: 'Checking…',
  online: (status: number | string) => `Online (${status})`,
  unreachable: (error: string) => `Unreachable (${error})`,
  accepted: (uid: string) => `Accepted (uid ${uid}…)`,
  rejected: (error: string) => `Rejected (${error})`,
  /** Stands in for an error with no message. */
  error: 'error',
  signingInTest: 'Signing in / creating test account…',
  signedInAs: (email: string | undefined, uid: string | undefined) =>
    `Signed in as ${email} (uid: ${uid}…)`,
  failed: (error: string) => `Failed: ${error}`,
  signedOut: 'Signed out.',
  signOutError: (error: string) => `Sign out error: ${error}`,
  backendConnection: 'Backend Connection',
  data: (source: string) => `Data: ${source}`,
  baseUrl: (url: string) => `API: ${url}`,
  mockData: (live: string[]) =>
    `mock data${live.length ? `, live: ${live.join(', ')}` : ''}`,
  backend: 'backend',
  health: (status: string) => `Backend health: ${status}`,
  checkHealth: 'Check backend health',
  signInCheck: (status: string) => `Backend sign-in check: ${status}`,
  checkSignIn: 'Check sign-in with backend',
  userAccount: 'User Account',
  status: (label: string) => `Status: ${label}`,
  email: (email: string) => `Email: ${email}`,
  anonymous: 'Anonymous user',
  uid: (uid: string) => `UID: ${uid}…`,
  authError: (error: string) => `Error: ${error}`,
  authStatus: {
    not_configured: 'off (Firebase values not set in .env)',
    signing_in: 'signing in…',
    signed_in: 'signed in',
    signed_out: 'signed out',
    error: 'failed',
  },
  testCredentials: 'Test user credentials',
  testEmail: 'Test email',
  testPassword: 'Test password',
  pleaseWait: 'Please wait…',
  signInTest: 'Sign in as test user',
  signOut: 'Sign out',
  restartOnboarding: 'Restart onboarding',
};

export const copy = {
  common,
  strength,
  tabs,
  map,
  jp,
  saveWord,
  history,
  reviewLabels,
  errors,
  captureToday,
  plans,
  rehearseResults,
  allTango,
  lists,
  tangoRow,
  meSections,
  review,
  mapScreen,
  me,
  prepare,
  rehearse,
  tangoDetail,
  welcome,
  login,
  today,
  reviewSession,
  sessionResults,
  capture,
  settings,
  developer,
};
