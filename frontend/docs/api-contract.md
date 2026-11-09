# Tankengo API contract (draft)

Draft for the frontend and backend to agree on. The frontend calls these from `frontend/src/api/*`. With `USE_MOCKS=true` (the default) it uses `frontend/src/mocks/*` instead and never calls the network.

- Base URL: `API_BASE_URL` in `frontend/.env` (default `http://10.0.2.2:8000`, the host machine as seen from the Android emulator).
- All `/api/v1/*` routes need `Authorization: Bearer <Firebase ID token>`. **The frontend doesn't send it yet** (no auth in this pass; see `request()` in `src/api/client.ts`).
- Types below are TypeScript. Frontend types live in `frontend/src/types/index.ts`. Proposed new endpoints use camelCase to match them; if the backend prefers snake_case, say so and the frontend will convert in `src/api/`.
- "Tango" is the frontend's name for a saved word, phrase, object or menu item. The backend currently calls it a "flashcard".

> **Daily limits:** paid endpoints (captures, catching, briefings, rehearsals and replies, TTS, review sessions, place search/nearby) return **429** with a user-facing `detail` ("Daily limit reached for … Try again tomorrow.") once a per-user daily limit is used; `api/client.ts` shows that message as-is. See backend/README.md.
>
> **Places on catches:** only a matched place's name is sent as `place_name`; placeholder labels ("Location off", "Near you", …) are dropped on both sides.

## 1. Endpoints that already exist in the backend

These are called as-is. The frontend converts the responses to its own types.

| Method | Path | Request | Response | Used by |
|---|---|---|---|---|
| GET | `/healthz` | – | `{ status: "ok" }` | Me › Developer › Check backend health (`api/health.ts`) |
| GET | `/api/v1/me` | – | `{ uid, email, name, picture, email_verified }` | not used yet |
| POST | `/api/v1/captures` | `{ image_base64: string, mime_type?: "image/jpeg" \| "image/png" \| "image/webp" }` | `CaptureResponse` | `uploadCapture()` |
| GET | `/api/v1/captures?limit=` | – | `CaptureResponse[]` | not used yet |
| GET | `/api/v1/captures/{capture_id}` | – | `CaptureResponse` | not used yet |
| POST | `/api/v1/flashcards/generate` | `{ capture_id?, item_id?, selected_text?, place_id?, place_name?, lat?, lng?, language? }` | `FlashcardCatchResponse` (one card per word: a repeat catch adds a sighting) | `catchTango()` |
| GET | `/api/v1/flashcards?due_only=&mastered=&capture_id=&limit=` | – | `FlashcardResponse[]` | `listTango()` (search is client-side) |
| GET | `/api/v1/flashcards/{id}` | – | `FlashcardResponse` | `getTango()` |
| POST | `/api/v1/flashcards/{id}/review` | `{ rating: "again" \| "good" \| "easy" }` | `FlashcardResponse` | `submitAnswer()`, `recordRecognition()` |
| POST | `/api/v1/flashcards/{id}/expand?refresh=` | – | `RelatedVocabItem[]` | not used yet |
| DELETE | `/api/v1/flashcards/{id}` | – | 204 | `undoCatch()` fallback |
| POST | `/api/v1/flashcards/{id}/sightings` | `{ recognized?, capture_id?, place_id?, place_name?, lat?, lng? }` | `FlashcardCatchResponse` ("seen again": sighting + review) | `recordRecognition()` |
| DELETE | `/api/v1/flashcards/{id}/sightings/{sighting_id}` | – | `FlashcardResponse \| null` (null = card deleted, it was the only sighting) | `undoCatch()` |

```ts
// From backend/app/schemas/capture.py
interface Vertex { x: number; y: number }            // normalized 0..1
interface DetectedItem {
  item_id: string;
  item_type: 'object' | 'text';
  source_label: string;
  japanese_text: string;
  reading: string | null;
  english_gloss: string | null;
  confidence: number | null;
  bounding_box: Vertex[];
}
interface CaptureResponse {
  capture_id: string;
  image_url: string;
  detected_items: DetectedItem[];
  created_at: string;                                  // ISO
}

// From backend/app/schemas/flashcard.py
interface FlashcardResponse {
  flashcard_id: string; capture_id: string; item_id: string | null;
  image_url: string; bounding_box: Vertex[];
  kanji: string; reading: string; romaji: string; meaning: string; part_of_speech: string;
  use_cases: { japanese: string; reading: string; english: string }[];
  related_vocab: { kanji: string; reading: string; meaning: string; relation_note: string }[];
  review_stats: { review_count: number; last_reviewed_at: string | null; next_review_at: string; mastered: boolean };
  created_at: string;
}
```

Mapping `FlashcardResponse` → `Tango` (`flashcardToTango()` in `src/api/tango.ts`):
`flashcard_id → id`, `kanji → text`, `reading`, `romaji`, `meaning`, `use_cases → examples`, `mastered → known`, strength = `mastered ? 4 : min(3, review_count)`, kind = `"phrase"` if `part_of_speech` mentions phrase, else `"word"`. `sightings` and `history` are empty because the backend doesn't store them yet.

## 2. Proposed endpoints (new)

Paths are marked `// TODO confirm endpoint` in `frontend/src/api/`. All under `/api/v1`.

### Places and visits (`api/places.ts`) — **implemented in P4**

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/v1/today` | – | `TodayResponse` |
| GET | `/api/v1/places/search?q=&lat=&lng=` | results near lat/lng first | `Place[]` |
| GET | `/api/v1/places/nearby?lat=&lng=` | – | `Place \| null` (closest within ~120 m) |
| GET | `/api/v1/places/{place_id}` | – | `Place` |
| GET | `/api/v1/visits` | – | `Visit[]` (upcoming, soonest first; kept 3 h after start) |
| POST | `/api/v1/visits` | `{ place_id, when }` | `Visit` |
| DELETE | `/api/v1/visits/{visit_id}` | – | 204 |

```ts
// snake_case on the wire (backend/app/schemas/place.py)
interface JpName { text: string; reading: string | null; romaji: string | null; meaning: string | null }
interface Place { id: string; name: JpName; category: string; area: string; lat: number; lng: number; address: string }
interface Visit { visit_id: string; place: Place; when: string; tango_count: number }
interface TodayResponse {
  user_name: string;
  up_next: Visit | null;
  pins: { id: string; label: string; count: number; lat: number; lng: number;
          kind: 'tango' | 'next'; area_id: string | null; stars: number }[];
  areas: { id: string; label: string; tango_count: number; place_count: number;
           sample: FlashcardResponse[]; more_count: number; plan_place_id: string | null }[];
  starter_tango: JpName[];
  // Picked for the user's reading level and interests; null if nothing fits.
  word_of_day: { text: string; reading: string; romaji: string; meaning: string;
                 reason: string } | null;
}
```

- Places come from Google Places API (New) with `GOOGLE_PLACES_API_KEY` (Japanese + English names fetched in parallel, cached in `places/{id}`). Without the key, a built-in list of Koenji/Nakano/Asagaya places is used (ids `builtin:*`).
- Today pins: one per area (from the place cache, else the sighting's place name). **Sightings inside the user's home area are never pinned.**
- The "you are here" pin is added by the app from device GPS. Review accepts `collection=area:<area_id>` for the area card's "Review these".
- Word of the day: from a hand-picked list of 119 everyday words (`backend/app/services/everyday_words.py`), filtered by the profile's reading level, weighted by the categories of planned visits and of places where Tango were caught, never one the user owns. Same word all day (seeded by user + date in Japan time). Reading and meaning come from JMdict; no AI call. `reason` is shown on the card ("For your visit to 麺屋たいき").

### Prepare (`api/prepare.ts`) — **implemented in P5**

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/places/{place_id}/briefing?language=English` | `BriefingResponse` |

```ts
// snake_case on the wire (backend/app/schemas/prepare.py)
interface BriefingResponse {
  place: Place;
  steps: string[];               // 3 "what to expect" steps, in order
  tango: { text: string; reading: string; romaji: string; meaning: string;
           flashcard_id: string | null }[];   // id set only if the user already has it
  tips: { id: string; quote: string; learners: number; when: string; in_rehearsal: boolean }[];
  source: string;                // short line on what the briefing is based on
}
```
- One Places Details call (reviews) + one Gemini call per place and language, cached in `places/{id}/briefing/{language}` for 7 days and shared by all users. Built-in places skip the reviews.
- Tips are read-only from the `tips` collection (filtered by place, max 5). Anonymous: only the tip and the place.

### Rehearse (`api/rehearse.ts`) — **implemented in P5**

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/v1/rehearsals` | `{ place_id, language }` | 201 `RehearsalStartResponse` |
| POST | `/api/v1/rehearsals/{id}/turns/{turn_id}` | `{ choice_index }` **or** `{ audio_base64, mime_type }` | `TurnResult` |
| GET | `/api/v1/rehearsals/{id}/results` | – | `RehearsalResult` |
| POST | `/api/v1/speech/tts` | `{ text, speed: 'slower' \| 'natural' }` | `{ audio_url }` |

```ts
// snake_case on the wire (backend/app/schemas/rehearsal.py)
interface ReplyChoice { jp: JpName; en: string; ok: boolean; label: string; note: string;
                        suggestion: { jp: JpName; why: string } | null }
interface RehearsalTurn { id: string; speaker: 'staff' | 'user'; jp: JpName; en: string;
                          hint: string | null;     // user turns; the model answer is the natural choice
                          choices: ReplyChoice[] }        // 3 on user turns, [] on staff turns
interface RehearsalStartResponse { rehearsal_id: string; place: Place; staff_voice: string; turns: RehearsalTurn[] }
interface TurnResult { turn_id: string; staff: JpName; said: JpName; spoken: boolean; ok: boolean;
                       label: string; note: string; suggestion: { jp: JpName; why: string } | null }
interface RehearsalResult { place: Place; lines: TurnResult[] }
```
- Script: one Gemini call per place and language, cached in `places/{id}/rehearsal/{language}`. Each start makes a session at `users/{uid}/rehearsals/{id}`.
- Spoken reply: the app records AMR-WB (`audio/amr-wb`, 16 kHz, max 2 MB). Cloud Speech-to-Text (Chirp 2, `ja-JP`, region `asia-southeast1`; falls back to the standard v1 model) writes down what was said, then one Gemini call rates that text. Gemini can't change the transcript. Nothing recognized → "couldn't hear that", no Gemini call. Needs the **Cloud Speech-to-Text API** enabled in the project (503 otherwise).
- Chosen reply: feedback comes from the script, no Gemini call.
- Staff voice: Cloud Text-to-Speech (`ja-JP-Neural2-B`, rate 0.8 slower / 1.0 natural), MP3 cached in Cloud Storage under `tts/`. If TTS is unavailable the app shows text only.

### Catching Tango — **dictionary first (JMdict)**

`POST /api/v1/flashcards/generate` (table above) now works three ways:

| Caller | `capture_id` | `item_id` | `selected_text` |
|---|---|---|---|
| Photo read (shutter / import) | yes | the detected item | optional (joined boxes send the joined text) |
| Live camera (text read on the phone) | – | – | the word |
| Tapping underlined Japanese / word of the day ("Save as Tango") | – | – | the word |

- If the word is in JMdict and the language is English, the card is saved at once from the dictionary (reading, romaji, meaning, part of speech) with no examples. Gemini then writes the 2 example phrases in the background (FastAPI `BackgroundTasks`) and saves them to the card. Tango detail polls for them (every 4 s, up to 4 times).
- Otherwise (not a dictionary word, or another explanation language) Gemini writes the whole card as before.
- Cards without a photo have `capture_id: ""` and `image_url: ""`; Review skips the photo question for them.

### Dictionary (`api/dictionary.ts`) — **new**

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/dictionary/lookup?text=` | `DictionaryEntry`, or 404 when it isn't a dictionary word |

```ts
interface DictionaryEntry { text: string; reading: string; romaji: string; meaning: string; part_of_speech: string }
```
- Local SQLite built from JMdict (`backend/data/jmdict.sqlite`, made by `backend/scripts/build_jmdict.py`; the Docker image builds its own). No API cost. Without the file, lookups 404 and catching falls back to Gemini.
- The app caches each lookup for the session. Used for meanings on camera boxes and the picked word.
- JMdict is © EDRDG, CC BY-SA 4.0; the credit line is on the Me screen.

### Capture (`api/capture.ts`)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/captures/read-selection` | `{ captureId or photo, box: NormalizedBox }` | `SelectionReading` |
| GET | `/catches/today` | – | `CatchEntry[]` |

```ts
interface NormalizedBox { x: number; y: number; w: number; h: number }  // 0..1
interface SelectionReading { tango: Tango; explanation: string; related: JpText[] }
interface CatchEntry { tango: Tango; placeName: string; status: 'new' | 'reviewed' }
```

### Review (`api/review.ts`) — **implemented in P3**

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/v1/review/card` | – | `ReviewCardResponse` |
| GET | `/api/v1/review/summary` | – | `ReviewSummaryResponse` |
| GET | `/api/v1/review/session?collection=` | `collection`: `place:<name>`, `area:<id>`, `place-cue`, `favorites`, `list:<list_id>`, or omitted (= everything due) | `ReviewSessionResponse` |
| GET | `/api/v1/review/session/{session_id}/result` | – | `SessionResultResponse` |

**Favorites and lists** (new):

| Method | Path | Request | Response |
|---|---|---|---|
| PATCH | `/api/v1/flashcards/{id}` | `{ favorite: boolean }` | `FlashcardResponse` (now has `favorite: boolean`) |
| GET | `/api/v1/lists` | – | `TangoList[]` (oldest first) |
| POST | `/api/v1/lists` | `{ name, tango_ids? }` | 201 `TangoList` |
| PATCH | `/api/v1/lists/{list_id}` | `{ name?, add?: string[], remove?: string[] }` | `TangoList` |
| DELETE | `/api/v1/lists/{list_id}` | – | 204 |

```ts
interface TangoList { list_id: string; name: string; tango_ids: string[]; created_at: string }
```
- Lists live at `users/{uid}/lists/{list_id}`; `tango_ids` are flashcard ids in the order added (no duplicates; deleting a list keeps the Tango).
- `review/summary` collections now also include `Favorites` (`is_favorites`, only if any) first and one entry per list (`is_list`, id `list:<list_id>`, count = Tango still owned).

Answers go to `POST /api/v1/flashcards/{id}/review` with `FlashcardReviewRequest: { rating?: 'again' | 'good' | 'easy', correct?: boolean, answer?: string, question_type?: QuestionType, session_id?: string }`. The backend derives the rating from `question_type` + `correct` (fill-in correct → `easy` +2, MCQ correct → `good` +1, flashcard → user's rating, any miss → `again` -1) and grades typed `answer` strings for fill-in-the-blank exercises.

Rules: up to 10 cards, weakest first, ordered easiest to hardest (`flashcard` → `mcq_photo` → `mcq` → `fill`). Text Tango move `flashcard` (2 good) → `mcq_photo` (2 right) → `mcq` (3 right) → `fill`; object Tango (and text Tango without a photo) skip `mcq_photo`. Two misses in a row demote one step. Wrong choices, reading distractors, and meaning synonyms come from one batched Gemini call per session, cached on each card (`distractors`, `meaning_synonyms`).

```ts
// snake_case on the wire (backend/app/schemas/review.py); frontend adapters convert.
type ReviewStage = 'flashcard' | 'mcq_photo' | 'mcq' | 'fill';
type QuestionType =
  | 'flashcard_text' | 'flashcard_object'
  | 'mcq_text_reading' | 'mcq_text_translate' | 'mcq_text_reverse' | 'mcq_object_name'
  | 'fill_text_reading' | 'fill_text_translate' | 'fill_text_reverse' | 'fill_object_name';
interface PhotoLayer {
  image_url: string;
  box: { x: number; y: number; w: number; h: number };   // normalized, display orientation
  caption: string;
}
interface ReviewCardResponse { due_count: number; minutes: number; areas: string[]; sample: FlashcardResponse[]; more_count: number }
interface ReviewSummaryResponse {
  due_count: number; minutes: number; place_cue_count: number; total_tango: number;
  collections: { id: string; label: string; count: number; is_place: boolean; is_place_cue: boolean }[];
  exercise_types: { id: string; label: string; enabled: boolean; count: number }[];
}
type JpOption = { text: string; reading: string; romaji: string };
type Exercise =
  | { id: string; type: 'flashcard'; question_type: 'flashcard_text' | 'flashcard_object'; stage: ReviewStage;
      flashcard_id: string; photo: PhotoLayer | null; front: JpOption | null;
      back: { text: string; reading: string; romaji: string; meaning: string;
              example: { japanese: string; reading: string; english: string } | null };
      place_hint: string; next_step: string; promoted_to: ReviewStage | null; demoted_to: ReviewStage | null }
  | { id: string; type: 'mcq';
      question_type: 'mcq_text_reading' | 'mcq_text_translate' | 'mcq_text_reverse' | 'mcq_object_name';
      stage: ReviewStage; flashcard_id: string; photo: PhotoLayer | null;
      prompt_kind: 'jp' | 'meaning' | 'photo'; prompt: JpOption; meaning_prompt: string;
      options: (JpOption | string)[]; answer_index: number; place_hint: string;
      example: { japanese: string; reading: string; english: string } | null; next_step: string;
      promoted_to: ReviewStage | null; demoted_to: ReviewStage | null }
  | { id: string; type: 'fill';
      question_type: 'fill_text_reading' | 'fill_text_translate' | 'fill_text_reverse' | 'fill_object_name';
      stage: ReviewStage; flashcard_id: string; photo: PhotoLayer | null;
      prompt: JpOption; meaning_prompt: string;
      cloze: { japanese: string; reading: string; english: string } | null;
      answer_kind: 'kana' | 'meaning'; accepted_answers: string[]; answer_display: string;
      place_hint: string; example: { japanese: string; reading: string; english: string } | null;
      next_step: string; promoted_to: ReviewStage | null; demoted_to: ReviewStage | null };
interface ReviewSessionResponse { session_id: string; exercises: Exercise[] }
interface SessionResultResponse {
  reviewed: number; minutes: number;
  biggest_win: { flashcard_id: string; tango: JpOption; meaning: string; title: string; detail: string } | null;
  by_area: { area: string; count: number }[];
  next: null;   // next planned visit, once visits exist (P4)
}
```

Detection boxes are stored in **display orientation**: `POST /captures` reads the photo's EXIF orientation and rotates Cloud Vision's boxes to match.

### Me (`api/user.ts`) — **implemented in P2**

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/v1/me/profile` | – | `ProfileResponse` |
| PUT | `/api/v1/me/profile` | `{ name?, reading_level?, home_area? }` (fields left out stay as they are) | `ProfileResponse` |

```ts
// snake_case on the wire (backend/app/schemas/user.py)
type ReadingLevel = 'none' | 'kana' | 'some_kanji' | 'most';
interface HomeArea { label: string; lat: number; lng: number; radius_m: number }  // 100-3000 m
interface ProfileResponse {
  uid: string;
  name: string;            // chosen name, else sign-in name, else "Learner"
  level_note: string;      // e.g. "Reads some everyday kanji"
  reading_level: ReadingLevel | null;
  home_area: HomeArea | null;
  stats: { tango: number; stars: number; places: number };  // stars = strength 4; places = distinct place names
}
```

The chosen name is stored as `display_name` on `users/{uid}`, separate from the token `name` that `GET /me` syncs, so anonymous sign-ins never wipe it. The Welcome screen saves `reading_level` when onboarding finishes. `home_area` is stored but not used yet; P4 must keep pins out of it. Display settings (kanji/romaji, furigana…) stay on the device.

## 3. The shared `Tango` type

```ts
interface Tango {
  id: string;
  kind: 'word' | 'phrase' | 'object' | 'menu_item';
  text: string; reading: string; romaji: string; meaning: string;
  sightings: { placeId: string; placeName: string; lat: number; lng: number; seenAt: string; imageUrl?: string }[];
  strength: 0 | 1 | 2 | 3 | 4;   // 4 = star on the map
  known: boolean;
  history: { type: 'caught' | 'reviewed' | 'seen_again'; label: string; detail: string; badge: string }[];
  examples: { register: 'easy' | 'keigo'; jp: JpText }[];
  explanation?: string;
}
```

## 4. Gaps to agree on

1. ~~Places on Tango~~ **Done in P1:** flashcards have `sightings[]`; generate and captures accept place fields. Still open: home-area pins must never be stored (privacy screen promise).
2. ~~Strength 0–4~~ **Done in P1:** `strength` (review good +1, easy +2, again −1, seen again +1, max 4; 4 = mastered).
3. ~~Kind~~ **Done in P1:** Gemini classifies `kind`; examples carry `register` (`easy`/`keigo`).
4. **Naming.** "Tango" (frontend, product) vs "flashcard" (backend). Either is fine; we should pick one for new endpoints.
5. ~~History~~ **Done in P1:** `history[]` with `caught | reviewed | seen_again` and `strength_after`.
6. ~~"Seen again"~~ **Done in P1:** `POST /flashcards/{id}/sightings`.
7. **Auth.** The frontend needs Firebase Auth before any real call works.
8. **Live detection.** Lens-style live highlights should run on the device (ML Kit text recognition with the Japanese script model + object detection on VisionCamera frames; seam in `frontend/src/features/capture/detector.ts`). The backend stays the source for the shutter, "Read this" and Gemini explanations. Google Lens itself has no public API.
