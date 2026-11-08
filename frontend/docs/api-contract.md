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

### Places and visits (`api/places.ts`)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/today` | – | `TodaySummary` |
| GET | `/places/search?q=` | – | `Place[]` (Google Maps Places, proxied so the key stays server-side) |
| GET | `/places/{placeId}` | – | `Place` |
| GET | `/places/nearby?lat=&lng=` | – | `{ name: string }` (reverse geocode for the camera's place pill) |
| GET | `/visits` | – | `Visit[]` |
| POST | `/visits` | `{ placeId: string, when: string }` | `Visit` |

```ts
interface JpText { text: string; reading?: string; romaji?: string; meaning?: string }
interface Place {
  id: string; name: JpText; category: string;
  area: string; lat: number; lng: number; note?: string;
}
interface Visit { id: string; place: Place; when: string; tangoCount: number }
interface MapPin { id: string; label: string; count: number; x: number; y: number; kind: 'tango' | 'next' | 'me' }
interface TodaySummary { userName: string; upNext: Visit | null; pins: MapPin[]; starterTango: JpText[] }
```
`MapPin.x/y` are placeholder-map positions; once a map SDK is in, pins should carry `lat/lng` instead.

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

### Review (`api/review.ts`)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/review/card` | – | `ReviewCard` |
| GET | `/review/summary` | – | `ReviewSummary` |
| GET | `/review/session?collection=` | – | `Exercise[]` |
| GET | `/review/session/result` | – | `SessionResult` |

Answers go to the existing `POST /flashcards/{id}/review` (`good` if correct, `again` if not).

```ts
interface ReviewCard { dueCount: number; minutes: number; areas: string[]; sample: Tango[]; moreCount: number }
interface ReviewSummary {
  dueCount: number; minutes: number; placeCueCount: number; totalTango: number;
  collections: { id: string; label: string; count: number; isPlace: boolean; isPlaceCue: boolean }[];
  exerciseTypes: { id: string; label: string; enabled: boolean }[];
}
type Exercise =
  | { id: string; type: 'multiple_choice'; tangoId: string; prompt: JpText; options: string[];
      answerIndex: number; placeHint: string; example: JpText & { en: string }; nextStep: string }
  | { id: string; type: 'fill_gap'; tangoId: string;
      photo: { imageUrl?: string; caption: string; lines: string[] };
      gap: NormalizedBox; options: JpText[]; answerIndex: number; note: string };
interface SessionResult {
  reviewed: number; minutes: number;
  biggestWin: { tango: JpText; title: string; detail: string };
  byArea: { area: string; count: number }[];
  next: { label: string; placeId: string; placeName: JpText; day: string };
}
```

### Me (`api/user.ts`)

| Method | Path | Response |
|---|---|---|
| GET | `/me/profile` | `{ name: string; levelNote: string; stats: { tango: number; stars: number; places: number } }` |

Settings are stored on the device only (AsyncStorage) in this pass. A `GET/PUT /me/settings` can come later if settings should follow the user across devices.

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
