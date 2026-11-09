# DevFest 2026: FastAPI Backend

FastAPI backend for Tankengo. It verifies **Firebase Authentication** tokens, stores data in **Cloud Firestore** and **Cloud Storage**, and calls Cloud Vision, Speech-to-Text, Text-to-Speech, Places API (New) and Gemini. It is containerized for **Google Cloud Run** via **Google Cloud Build**.

---

## 1. Prerequisites

- **Python 3.12+** (pinned in `.python-version`)
- **[uv](https://docs.astral.sh/uv/)** (recommended) or standard `venv` + `pip`
- **[Google Cloud SDK (`gcloud` CLI)](https://cloud.google.com/sdk/docs/install)** (used for local keyless authentication to Firebase and Google Cloud APIs)
- Access to the project's **Firebase / Google Cloud Project**

---

## 2. Directory Structure

```text
backend/
├── app/
│   ├── api/
│   │   ├── deps.py            # Bearer-token verification, Firestore and HTTP clients, daily_limit()
│   │   ├── router.py          # /healthz, /readyz, GET /api/v1/me; mounts the routers below
│   │   └── endpoints/
│   │       ├── captures.py    # photo upload and recognition
│   │       ├── flashcards.py  # catching Tango, reviews, sightings, favourites
│   │       ├── review.py      # review card, summary, sessions, results
│   │       ├── me.py          # profile (name, reading level, home area, stats)
│   │       ├── places.py      # place search, visits, Today screen
│   │       ├── prepare.py     # briefings, rehearsals, staff speech
│   │       ├── lists.py       # user-made review lists
│   │       └── dictionary.py  # JMdict lookup
│   ├── core/
│   │   ├── config.py          # Environment variable settings (pydantic-settings)
│   │   └── firebase.py        # Firebase Admin, Async Firestore, Storage and HTTP client lifecycle
│   ├── schemas/               # Pydantic request/response models, one file per area
│   └── services/              # Business logic. *_rules.py files are pure (no I/O) and unit-tested
│       ├── firestore.py       # captures, flashcards, review sessions in Firestore
│       ├── tango_rules.py     # card identity, strength 0-4, sightings, history
│       ├── review.py / review_rules/         # due cards, sessions, questions, results
│       ├── places.py / place_rules.py        # Places API, place cache, map pins and areas
│       ├── visits.py          # planned visits and the Today summary
│       ├── profile.py         # profile fields and Me-tab stats
│       ├── briefing.py        # prepare briefings (Places reviews + Gemini, cached)
│       ├── rehearsal.py / rehearsal_rules.py # role-play scripts and rating replies
│       ├── stt.py / tts.py    # Speech-to-Text and Text-to-Speech
│       ├── gemini.py          # shared structured-JSON Gemini call
│       ├── flashcard_generator.py            # card content, related words, quiz wrong answers
│       ├── vision.py / image_orientation.py  # Cloud Vision reads and EXIF box rotation
│       ├── storage.py         # Cloud Storage uploads
│       ├── dictionary.py      # JMdict lookups (local SQLite)
│       ├── word_of_day.py / everyday_words.py # word of the day
│       ├── lists.py           # lists and favourites
│       └── usage.py           # per-user daily limits
├── scripts/
│   ├── build_jmdict.py        # builds data/jmdict.sqlite
│   └── clear_placeholder_places.py  # one-off clean-up of old placeholder place names
├── tests/                     # pytest unit tests for the pure rules
├── main.py                    # FastAPI entrypoint and lifespan hooks
├── Dockerfile                 # Production container image for Cloud Run
├── cloudbuild.yaml            # Cloud Build pipeline for Artifact Registry and Cloud Run
├── pyproject.toml             # Project metadata and dependencies
└── requirements.txt           # Pinned dependencies for Docker / pip
```

---

## 3. Local Development Setup

### Step 1: Navigate to the backend directory
```bash
cd backend
```

### Step 2: Install dependencies

**Option A: Using `uv` (Recommended):**
```bash
uv sync
```

**Option B: Using standard `venv` + `pip`:**
```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Adding or changing dependencies:** edit `pyproject.toml` (or use `uv add <pkg>`), then regenerate the Docker requirements so they match `uv.lock`:
```bash
uv lock && uv export --frozen --no-dev --no-hashes --no-emit-project -o requirements.txt
```

### Step 3: Configure environment variables
Copy the root `.env.example` to `.env` (either in the repository root or inside `backend/.env`):

```bash
cp ../.env.example .env
```

| Variable | Required | What it does |
| :--- | :--- | :--- |
| `FIREBASE_PROJECT_ID` | Yes | Firebase / Google Cloud project ID |
| `FIRESTORE_DATABASE_ID` | No | Defaults to `(default)` |
| `GCS_BUCKET_NAME` | No | Photo bucket. Defaults to `<FIREBASE_PROJECT_ID>.firebasestorage.app` |
| `GEMINI_API_KEY` | For AI features | Gemini API key from Google AI Studio |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash` |
| `GOOGLE_PLACES_API_KEY` | For real places | Server-side key for Places API (New). Keep it separate from the Android Maps key |
| `MAX_UPLOAD_BYTES` | No | Photo size limit, default 10 MiB |
| `LIMIT_*` | No | Daily limits, see below |

Without `GOOGLE_PLACES_API_KEY` the backend uses a small built-in list of Koenji, Nakano and Asagaya places (ids start with `builtin:`). Without `GEMINI_API_KEY`, the endpoints that need Gemini return 503, and label enrichment on photo reads is skipped.

### Step 4: Authenticate with Google Cloud / Firebase (Keyless ADC)
Instead of downloading service account JSON keys, authenticate your local machine using **Application Default Credentials (ADC)**:

```bash
gcloud auth login
gcloud config set project YOUR_FIREBASE_PROJECT_ID
gcloud auth application-default login
```

### Step 4b: Turn on the Google Cloud APIs (one time per project)
In the Google Cloud console for the Firebase project, open **APIs & Services → Library** and enable:

| API | Used for | Key? |
| :--- | :--- | :--- |
| Cloud Firestore | all user data | ADC |
| Cloud Storage | photos and cached staff speech | ADC |
| Cloud Vision | reading text and objects in photos | ADC |
| Cloud Text-to-Speech | the staff voice in Rehearse, and 🔈 on words | ADC |
| **Cloud Speech-to-Text** | transcribing spoken replies in Rehearse | ADC |
| Places API (New) | place search, nearby, briefings | `GOOGLE_PLACES_API_KEY` |
| Gemini (AI Studio) | briefings, rehearsal scripts, rating replies, card examples, quiz wrong answers | `GEMINI_API_KEY` |

The ADC ones need no key: the backend uses your `gcloud auth application-default login` credentials (or the Cloud Run service account). If one is off, the endpoints that need it fail (Speech-to-Text returns a 503 that names the API; the others show up as 5xx errors in the backend log). Billing must be on for the project.

### Daily limits on paid APIs
Endpoints that call paid Google APIs count calls per user per day (Japan time) in `users/{uid}/usage/{date}` and return **429** with a friendly message once a limit is used. Defaults are generous for real use; change them with env vars (`0` = no limit):

| Env var | Endpoint | Default/day |
| :--- | :--- | :--- |
| `LIMIT_VISION` | `POST /captures` | 150 |
| `LIMIT_CATCH` | `POST /flashcards/generate` | 300 |
| `LIMIT_BRIEFING` | `GET /places/{id}/briefing` | 60 |
| `LIMIT_REHEARSAL` | `POST /rehearsals` | 40 |
| `LIMIT_REPLY` | `POST /rehearsals/{id}/turns/{turn}` | 150 |
| `LIMIT_TTS` | `POST /speech/tts` | 400 |
| `LIMIT_REVIEW` | `GET /review/session` | 80 |
| `LIMIT_PLACES` | `GET /places/search`, `/places/nearby` | 400 |

If the counter can't be reached, calls are allowed.

### Step 4c: Build the dictionary (one time)
Tango cards for dictionary words are made instantly from JMdict instead of Gemini (Gemini then adds the example phrases in the background). Build the local database once (downloads ~12 MB, writes `data/jmdict.sqlite`, ~90 MB, git-ignored):

```bash
uv run python scripts/build_jmdict.py
```

Without it the backend still works; every catch just goes to Gemini (slower), and `GET /dictionary/lookup` returns 404. The Docker image builds its own copy. JMdict is © EDRDG, used under CC BY-SA 4.0.

### Step 5: Run the FastAPI server locally

**Using `uv`:**
```bash
uv run uvicorn main:app --reload --port 8000
```

**Using activated `.venv`:**
```bash
uvicorn main:app --reload --port 8000
```

**Windows:** if requests hang or port 8000 stays busy after a restart, run without `--reload` (the reloader can leave old workers holding the port) and restart the server by hand after code changes.

### Step 6: Run the tests
```bash
uv run pytest
```
The tests cover the pure rules (card strength and identity, review sessions, places and map pins, rehearsal and briefing parsing, lists, profile, word of the day, usage limits, dictionary, speech transcript parsing, image orientation). They don't call Google APIs or Firestore.

---

## 4. API Overview

Once the server is running at `http://localhost:8000`, open `/docs` for the interactive Swagger UI. Every `/api/v1` route needs `Authorization: Bearer <Firebase ID token>`. Request and response shapes are in [`../frontend/docs/api-contract.md`](../frontend/docs/api-contract.md).

| Area | Endpoints |
| :--- | :--- |
| Health (no auth) | `GET /`, `GET /healthz`, `GET /readyz` |
| Account | `GET /api/v1/me` (token claims, synced to `users/{uid}`); `GET`, `PUT /api/v1/me/profile` (name, reading level, home area, stats) |
| Capture | `POST /api/v1/captures` (JSON base64 or raw image), `GET /api/v1/captures`, `GET /api/v1/captures/{id}` |
| Tango | `POST /api/v1/flashcards/generate`, `GET /api/v1/flashcards`, `GET`, `PATCH`, `DELETE /api/v1/flashcards/{id}`, `POST .../review`, `POST .../expand`, `POST .../sightings`, `DELETE .../sightings/{sighting_id}` |
| Review | `GET /api/v1/review/card`, `/summary`, `/session`, `/session/{session_id}/result` |
| Places | `GET /api/v1/places/search`, `/places/nearby`, `/places/{place_id}` |
| Visits and Today | `GET`, `POST /api/v1/visits`, `DELETE /api/v1/visits/{visit_id}`, `GET /api/v1/today` |
| Prepare and Rehearse | `GET /api/v1/places/{place_id}/briefing`, `POST /api/v1/rehearsals`, `POST /api/v1/rehearsals/{id}/turns/{turn_id}`, `GET /api/v1/rehearsals/{id}/results`, `POST /api/v1/speech/tts` |
| Lists | `GET`, `POST /api/v1/lists`, `PATCH`, `DELETE /api/v1/lists/{list_id}` |
| Dictionary | `GET /api/v1/dictionary/lookup?text=` |

### Testing a protected endpoint
Pass a valid Firebase Auth ID token from the frontend in the `Authorization` header:
```bash
curl -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" http://localhost:8000/api/v1/me/profile
```

### Where data lives

| Path | Contents |
| :--- | :--- |
| `users/{uid}` | Token claims plus `display_name`, `reading_level`, `home_area` |
| `users/{uid}/captures`, `flashcards` | Uploaded photos with their reads; Tango with sightings and history |
| `users/{uid}/review_sessions`, `rehearsals`, `visits`, `lists`, `usage` | Sessions and their answers, role-plays, planned visits, lists, daily counters |
| `places/{place_id}` | Shared place cache, with `briefing/{language}` and `rehearsal/{language}` subdocuments |
| `tips` | Anonymous tips per place (read-only for now; there is no endpoint to add one) |
| Storage `captures/{uid}/…`, `tts/…` | Photos; cached staff speech |

---

## 5. Running with Docker Locally

To test the production container locally using your local gcloud Application Default Credentials:

```bash
docker build -t devfest-backend .

docker run --rm -p 8080:8080 \
  -e FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID \
  -e GEMINI_API_KEY=YOUR_GEMINI_KEY \
  -e GOOGLE_PLACES_API_KEY=YOUR_PLACES_KEY \
  -e GOOGLE_APPLICATION_CREDENTIALS=/tmp/keys/application_default_credentials.json \
  -v ~/.config/gcloud/application_default_credentials.json:/tmp/keys/application_default_credentials.json:ro \
  devfest-backend
```

The image build downloads JMdict and builds `data/jmdict.sqlite`, so it needs network access.

---

## 6. Cloud Run Deployment (via Cloud Build)

Deployment is automated via `cloudbuild.yaml`:
1. Builds the Docker image from `backend/Dockerfile`.
2. Pushes the image to Google Artifact Registry (`$_REGION-docker.pkg.dev/$PROJECT_ID/$_AR_REPO/$_SERVICE_NAME`).
3. Deploys the image to Cloud Run with `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID` and `GCS_BUCKET_NAME` set as env vars, and `GEMINI_API_KEY` and `GOOGLE_PLACES_API_KEY` mounted from Secret Manager.

Before the first deploy, create both secrets in Secret Manager and let the Cloud Run service account read them. The service account also needs access to Firestore, Cloud Storage, Vision, Speech-to-Text and Text-to-Speech.
