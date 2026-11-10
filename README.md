# Tankengo (探検語)

**Live it. Learn it.** Your everyday is your Japanese teacher.

Tankengo turns the Japanese around you (station signs, ticket machines, menus, shop counters) into your own vocabulary, then helps you read it and speak it before your next visit.

Google DevFest Tokyo Hackathon 2026 · Theme: *Own the why, build with intent* · Team ID: df-2026-t073

<!-- TODO(team): add how judges can try it, e.g.
**Try it:** Android APK via Firebase App Distribution (link), demo account (email / password).
-->

<!-- TODO(team): add 3-5 screenshots or a GIF: Catch → Tango page → Map → Rehearse.
<p>
  <img src="docs/screenshots/catch.png" width="200" alt="Catching a word from a sign">
  <img src="docs/screenshots/tango.png" width="200" alt="A Tango page with its history">
  <img src="docs/screenshots/map.png" width="200" alt="Tango stamps on the map">
  <img src="docs/screenshots/rehearse.png" width="200" alt="Rehearsing at a restaurant">
</p>
-->

## Problem

Tourists and foreign residents in Japan struggle with communication despite being surrounded by the local language. This often results in unnecessary friction in everyday life, with little progress beyond a handful of survival phrases.

Although language learning should be fun, accessible, and deeply personal, existing solutions either solve the immediate communication barrier without building long-term skills (such as translation apps), or teach generic content that rarely carries over to practical, everyday use.

## Solution

To personalize Japanese learning for tourists and foreign residents by turning words from real places and experiences into vocabulary for reading and speaking practice.

Tankengo is camera-first and built around place. You catch words from the real world, each one remembers where you found it, and the app helps you prepare for the next place you plan to visit.

## What it does

- **Catch.** Point the camera at Japanese text and it is read on the phone (ML Kit). Or take a photo and the backend reads it (Cloud Vision). Each catch becomes a **Tango** (word, phrase, object or menu item) pinned to the place where you found it.
- **Tango.** Reading, romaji, meaning, easy and keigo example phrases, where you saw it, and a history of how it grew: caught, seen again, reviewed, heard and said in rehearsals. Strength grows from 0 to 4; at 4 it becomes a hanamaru stamp on your map.
- **Map and Today.** Your Tango as stamps on a Google map, your next planned visit, and a word of the day picked for your level and the places you plan to visit.
- **Review.** Multiple choice, plus **fill the gap** on your own photo with the caught word covered. Questions are cued by the place you saw the word. Favorites and your own lists are reviewable collections.
- **Prepare.** A briefing for a place: what to expect (from Google Maps reviews, written by Gemini), Tango for the visit, and anonymous tips.
- **Rehearse.** A spoken role-play with the staff at that place. The staff voice is text-to-speech, your reply is transcribed by Speech-to-Text and rated by Gemini, or you can pick a reply instead. Lines that use your Tango can be saved to them.
- **Privacy.** Sign in with Google or email, no public profile, a home area you choose that is never pinned on the map, and in-app account deletion that removes all your data and photos.

## Why it's built this way

- **Learn what you actually meet.** Every Tango comes from your own life, so the vocabulary is relevant by definition. No fixed word list.
- **Place is the memory cue.** Each Tango keeps where you found it. Review questions are cued by that place, and fill-the-gap uses your own photo, so recall is tied to a real moment.
- **From reading to speaking.** Catching builds reading; Prepare and Rehearse turn the same words into a conversation before you walk in. The Tango page shows that journey.
- **Visible progress.** Strength 0–4 and hanamaru stamps on the map turn practice into places you've "owned", without streak pressure.
- **Fast and affordable.** Live camera reading runs on the phone (ML Kit). Paid APIs are only called when they add something, and results such as briefings, scripts and speech are cached and shared. Per-user daily limits keep costs predictable.
- **Works on the go.** Cached screens load instantly and changes made offline are queued and sent later.
- **Respect the learner.** One level setting sets sensible display defaults (romaji, kana, furigana) that can each be changed. No public profile, and data is yours to delete.

## Architecture

```text
Android app (React Native)                         Google Cloud
 ├─ ML Kit (on-device text reading)         ┌─ FastAPI on Cloud Run
 ├─ Google Maps SDK                          │   ├─ Cloud Vision (photo reading)
 ├─ Firebase Auth (Google, email)  ──HTTPS──▶│   ├─ Gemini (meanings, briefings, scripts, rating)
 └─ Offline cache and queue                  │   ├─ Speech-to-Text / Text-to-Speech (rehearsal)
                                             │   ├─ Places API (New) (places, reviews)
                                             │   └─ JMdict (dictionary)
                                             └─ Firestore (user data, caches) · Cloud Storage (photos, audio)
```

## Team

- Stephen
- Valerie
- Arnold
- Haozhi

## Tech stack

| Layer | What we use |
| :--- | :--- |
| Mobile app | React Native 0.88 (Android), VisionCamera with ML Kit text recognition, react-native-maps, Firebase Auth (Google and email) |
| Backend | FastAPI on Python 3.12, managed with `uv`; Docker image for Cloud Run |
| Data | Cloud Firestore (user data, place and briefing caches), Cloud Storage (photos, cached speech) |
| Google APIs | Cloud Vision, Cloud Speech-to-Text, Cloud Text-to-Speech, Places API (New), Gemini |
| Dictionary | JMdict (local SQLite, built by a script), used under CC BY-SA 4.0 |

## Repository layout

```text
.
├── backend/    FastAPI service (see backend/README.md)
├── frontend/   React Native Android app (see frontend/README.md)
└── .env.example   Backend and Android build keys (copy to .env); app settings are in frontend/.env.example
```

## Getting started

1. Copy `.env.example` to `.env` in the repository root and fill it in:

   | Variable | Used by | What it is |
   | :--- | :--- | :--- |
   | `FIREBASE_PROJECT_ID` | backend | Firebase / Google Cloud project ID |
   | `GEMINI_API_KEY` | backend | Gemini API key from Google AI Studio |
   | `GEMINI_MODEL` | backend | Optional model override (default `gemini-3.5-flash`) |
   | `GOOGLE_PLACES_API_KEY` | backend | Server-side key for Places API (New) |
   | `GOOGLE_MAPS_API_KEY` | app build | Android Maps SDK key, baked into the app at build time |

   Use two different keys for Maps and Places: the Maps key is restricted to the Android app, the Places key is for the server.

2. Copy `frontend/.env.example` to `frontend/.env` and fill it in. These are the app's own settings:

   | Variable | What it is |
   | :--- | :--- |
   | `USE_MOCKS`, `LIVE_APIS` | Mock data or the real backend, per area |
   | `API_BASE_URL` | Backend URL (`http://10.0.2.2:8000` in the emulator) |
   | `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` | Firebase web app config |
   | `GOOGLE_WEB_CLIENT_ID` | Needed for Google sign-in. Web client ID from Firebase › Authentication › Sign-in method › Google › Web SDK configuration |
   | `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` | Optional fixed test account |

   Google sign-in also needs the debug keystore's SHA-1 and SHA-256 registered in Firebase; see [`frontend/README.md`](./frontend/README.md#4-mock-data-and-the-backend).

3. Run the backend: follow [`backend/README.md`](./backend/README.md) (Google Cloud sign-in, enabling the APIs, `uv run uvicorn main:app --port 8000`).
4. Run the app: follow [`frontend/README.md`](./frontend/README.md). It runs on mock data until you point it at the backend.
5. The request and response shapes between the two are in [`frontend/docs/api-contract.md`](./frontend/docs/api-contract.md).
