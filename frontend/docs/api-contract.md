# Tankengo API contract (draft)

Draft for the frontend and backend to agree on. The frontend calls these from `frontend/src/api/*`. With `USE_MOCKS=true` (the default) it uses `frontend/src/mocks/*` instead and never calls the network.

- Base URL: `API_BASE_URL` in `frontend/.env` (default `http://10.0.2.2:8000`, the host machine as seen from the Android emulator).
- All `/api/v1/*` routes need `Authorization: Bearer <Firebase ID token>`. **The frontend doesn't send it yet** (no auth in this pass; see `request()` in `src/api/client.ts`).
- Types below are TypeScript. Frontend types live in `frontend/src/types/index.ts`. Proposed new endpoints use camelCase to match them; if the backend prefers snake_case, say so and the frontend will convert in `src/api/`.
- "Tango" is the frontend's name for a saved word, phrase, object or menu item. The backend currently calls it a "flashcard".

## 1. Endpoints that already exist in the backend

These are called as-is. The frontend converts the responses to its own types.

| Method | Path | Request | Response | Used by |
|---|---|---|---|---|
| GET | `/healthz` | – | `{ status: "ok" }` | Me › Developer › Check backend health (`api/health.ts`) |
| GET | `/api/v1/me` | – | `{ uid, email, name, picture, email_verified }` | not used yet |
| POST | `/api/v1/captures` | `{ image_base64: string, mime_type?: "image/jpeg" \| "image/png" \| "image/webp" }` | `CaptureResponse` | `uploadCapture()` |
| GET | `/api/v1/captures?limit=` | – | `CaptureResponse[]` | not used yet |
| GET | `/api/v1/captures/{capture_id}` | – | `CaptureResponse` | not used yet |
| POST | `/api/v1/flashcards/generate` | `{ capture_id, item_id?, selected_text?, place_id?, place_name?, lat?, lng?, language? }` | `FlashcardCatchResponse` (one card per word: a repeat catch adds a sighting) | `catchTango()` |
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
}
```

- Places come from Google Places API (New) with `GOOGLE_PLACES_API_KEY` (Japanese + English names fetched in parallel, cached in `places/{id}`). Without the key, a built-in list of Koenji/Nakano/Asagaya places is used (ids `builtin:*`).
- Today pins: one per area (from the place cache, else the sighting's place name). **Sightings inside the user's home area are never pinned.**
- The "you are here" pin is added by the app from device GPS. Review accepts `collection=area:<area_id>` for the area card's "Review these".

### Prepare (`api/prepare.ts`)

| Method | Path | Response |
|---|---|---|
| GET | `/places/{placeId}/briefing` | `PrepareBriefing` (Gemini, grounded in Google Maps reviews) |

```ts
interface PrepareBriefing {
  place: Place;
  steps: string[];               // "what to expect", in order
  tango: Tango[];                // Tango likely needed at this place
  tips: { id: string; quote: string; learners: number; when: string; inRehearsal: boolean }[];
  source: string;                // e.g. "Prepared by Gemini · grounded in Google Maps"
}
```
Tips are anonymous: only the tip and the place. No user id, no exact time.

### Rehearse (`api/rehearse.ts`)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/rehearsals` | `{ placeId: string, speed: 'slower' \| 'natural' }` | `RehearsalScript` |
| GET | `/rehearsals/latest/results?placeId=` | – | `RehearsalResult` |

```ts
interface RehearsalTurn {
  id: string; speaker: 'staff' | 'user'; jp: JpText; en: string;
  naturalness?: { ok: boolean; label: string };                          // user turns
  hint?: { explanation: string; model: JpText; modelEn: string };        // user turns
}
interface RehearsalScript { place: Place; staffVoice: string; turns: RehearsalTurn[] }
interface RehearsalResult {
  place: Place;
  lines: { staff: JpText; said: JpText; ok: boolean; note: string; suggestion?: { jp: JpText; why: string } }[];
}
```
Open question: the real role-play is turn-by-turn with speech. Likely shape: `POST /rehearsals` → `{ rehearsalId, firstTurn }`, then `POST /rehearsals/{id}/turns` with audio or text → `{ userTurn (with naturalness), staffTurn }`, then `GET /rehearsals/{id}/results`. The mock uses a fixed script for now.

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
| GET | `/api/v1/review/session?collection=` | `collection`: `place:<name>`, `place-cue`, or omitted (= everything due) | `ReviewSessionResponse` |
| GET | `/api/v1/review/session/{session_id}/result` | – | `SessionResultResponse` |

Answers go to `POST /api/v1/flashcards/{id}/review` with `{ rating: 'good' | 'again', session_id }` (correct → `good`). The `session_id` makes the answer count in the results.

Rules: up to 10 cards, weakest first; without a collection only due cards, with a collection not-yet-due cards fill the rest. Cards with a photo and a box alternate as fill-the-gap; the rest are multiple choice. Wrong choices come from one batched Gemini call per session, cached on each card (`distractors`); if Gemini fails they come from the user's other cards, then a built-in list.

```ts
// snake_case on the wire (backend/app/schemas/review.py); frontend adapters convert.
interface ReviewCardResponse { due_count: number; minutes: number; areas: string[]; sample: FlashcardResponse[]; more_count: number }
interface ReviewSummaryResponse {
  due_count: number; minutes: number; place_cue_count: number; total_tango: number;
  collections: { id: string; label: string; count: number; is_place: boolean; is_place_cue: boolean }[];
  exercise_types: { id: string; label: string; enabled: boolean }[];
}
type JpOption = { text: string; reading: string; romaji: string };
type Exercise =
  | { id: string; type: 'multiple_choice'; flashcard_id: string; prompt: JpOption; options: string[];
      answer_index: number; place_hint: string;
      example: { japanese: string; reading: string; english: string } | null; next_step: string }
  | { id: string; type: 'fill_gap'; flashcard_id: string; image_url: string; caption: string;
      gap: { x: number; y: number; w: number; h: number };   // normalized, display orientation
      options: JpOption[]; answer_index: number; note: string };
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
