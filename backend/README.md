# DevFest 2026 — FastAPI Backend

FastAPI backend integrated with **Firebase Authentication** and **Cloud Firestore**, containerized for **Google Cloud Run** deployment via **Google Cloud Build**.

---

## 1. Prerequisites

- **Python 3.12+** (pinned in `.python-version`)
- **[uv](https://docs.astral.sh/uv/)** (recommended) or standard `venv` + `pip`
- **[Google Cloud SDK (`gcloud` CLI)](https://cloud.google.com/sdk/docs/install)** (used for local keyless authentication to Firebase & Firestore)
- Access to the project's **Firebase / Google Cloud Project**

---

## 2. Directory Structure

```text
backend/
├── app/
│   ├── api/
│   │   ├── deps.py          # FastAPI dependencies (Firebase Bearer token verification & Firestore DB client)
│   │   └── router.py        # API routes (/healthz, /readyz, /api/v1/me)
│   ├── core/
│   │   ├── config.py        # Environment variable settings (pydantic-settings)
│   │   └── firebase.py      # Firebase Admin SDK & Async Firestore lifecycle management
│   ├── schemas/
│   │   └── user.py          # Pydantic request/response schemas
│   └── services/
│       └── firestore.py     # Async Firestore CRUD operations
├── main.py                  # FastAPI application entrypoint & lifespan hooks
├── Dockerfile               # Production container image for Cloud Run
├── cloudbuild.yaml          # Cloud Build pipeline for Artifact Registry & Cloud Run
├── pyproject.toml           # Project metadata and dependencies
└── requirements.txt         # Pinned dependencies for Docker / pip
```

---

## 3. Local Development Setup

### Step 1: Navigate to the backend directory
```bash
cd backend
```

### Step 2: Install dependencies

**Option A — Using `uv` (Recommended):**
```bash
uv sync
```

**Option B — Using standard `venv` + `pip`:**
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
Copy the root `.env.example` to `.env` (either in the repository root or inside `backend/.env`) and set `FIREBASE_PROJECT_ID`:

```bash
cp ../.env.example .env
```

Make sure the following variable is filled in `.env`:
```env
FIREBASE_PROJECT_ID=your-firebase-project-id
# Optional: defaults to "(default)" if omitted
FIRESTORE_DATABASE_ID=(default)
```

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
| Cloud Vision | reading text and objects in photos | ADC |
| Cloud Text-to-Speech | the staff voice in Rehearse, and 🔈 on words | ADC |
| **Cloud Speech-to-Text** | transcribing spoken replies in Rehearse | ADC |
| Places API (New) | place search, nearby, briefings | `GOOGLE_PLACES_API_KEY` |
| Gemini (AI Studio) | briefings, rehearsal scripts, rating replies, card examples | `GEMINI_API_KEY` |

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
Tango cards for dictionary words are made instantly from JMdict instead of Gemini. Build the local database once (downloads ~12 MB, writes `data/jmdict.sqlite`, ~90 MB, git-ignored):

```bash
uv run python scripts/build_jmdict.py
```

Without it the backend still works; every catch just goes to Gemini (slower). The Docker image builds its own copy. JMdict is © EDRDG, used under CC BY-SA 4.0.

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

---

## 4. Verifying the Application

Once the server is running at `http://localhost:8000`:

| Endpoint | Method | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `/` | `GET` | No | Root status message |
| `/docs` | `GET` | No | Interactive Swagger UI documentation |
| `/healthz` | `GET` | No | Cloud Run liveness probe |
| `/readyz` | `GET` | No | Cloud Run readiness probe (verifies Firestore client initialization) |
| `/api/v1/me` | `GET` | **Yes** (`Bearer <ID_TOKEN>`) | Verifies a Firebase Auth ID token and syncs the user's profile to `users/{uid}` in Firestore |

### Testing the Protected Endpoint (`/api/v1/me`)
Pass a valid Firebase Auth ID token from the frontend in the `Authorization` header:
```bash
curl -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" http://localhost:8000/api/v1/me
```

---

## 5. Running with Docker Locally

To test the production container locally using your local gcloud Application Default Credentials:

```bash
docker build -t devfest-backend .

docker run --rm -p 8080:8080 \
  -e FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID \
  -e GOOGLE_APPLICATION_CREDENTIALS=/tmp/keys/application_default_credentials.json \
  -v ~/.config/gcloud/application_default_credentials.json:/tmp/keys/application_default_credentials.json:ro \
  devfest-backend
```

---

## 6. Cloud Run Deployment (via Cloud Build)

Deployment is automated via `cloudbuild.yaml`:
1. Builds the Docker image from `backend/Dockerfile`.
2. Pushes the image to Google Artifact Registry (`$_REGION-docker.pkg.dev/$PROJECT_ID/$_AR_REPO/$_SERVICE_NAME`).
3. Deploys the image to Cloud Run with `FIREBASE_PROJECT_ID` and `FIRESTORE_DATABASE_ID` injected automatically.

