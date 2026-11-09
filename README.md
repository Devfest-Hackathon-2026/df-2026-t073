# Tankengo (探検語)

Google DevFest Tokyo Hackathon 2026

Theme: *Own the why, build with intent*

Team ID: df-2026-t073

## Before starting

Please copy the contents of `.env.example` to `.env` and paste your API keys.

Do NOT remove `.env` from `.gitignore`.

The repo will become read-only once the deadline passes. Make sure to push all work to the submission repo before then. It will be used by panelists in the judging process.

Submit here: https://github.com/Devfest-Hackathon-2026/df-2026-t073

## Problem

Japanese learners who live in Japan meet the language in places: station signs, ramen ticket machines, ward-office counters. A textbook word list doesn't know where you are or where you're going next.

Tankengo is a camera-first vocabulary app built around place. You catch words from the real world, each one remembers where you found it, and the app helps you prepare for the next place you plan to visit.

## What it does

- **Catch.** Point the camera at Japanese text and it is read on the phone (ML Kit). Or take a photo and the backend reads it (Cloud Vision). Each catch becomes a **Tango** (word, phrase, object or menu item) pinned to the place where you found it.
- **Tango.** Reading, romaji, meaning, easy and keigo example phrases, where you saw it, and a history. Strength grows from 0 to 4; at 4 it becomes a hanamaru star on your map.
- **Map and Today.** Your Tango as stamps on a Google map, your next planned visit, and a word of the day picked for your reading level and the places you plan to visit.
- **Review.** Multiple choice, plus **fill the gap** on your own photo with the caught word covered. Questions are cued by the place you saw the word. Favorites and your own lists are reviewable collections.
- **Prepare.** A briefing for a place: what to expect (from Google Maps reviews, written by Gemini), Tango for the visit, and anonymous tips.
- **Rehearse.** A spoken role-play with the staff at that place. The staff voice is text-to-speech, your reply is transcribed by Speech-to-Text and rated by Gemini, or you can pick a reply instead.
- **Privacy.** Sign in with Google or email, no public profile, and a home area you choose that is never pinned on the map.

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
└── .env.example   API keys shared by both (copy to .env)
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

2. Run the backend: follow [`backend/README.md`](./backend/README.md) (Google Cloud sign-in, enabling the APIs, `uv run uvicorn main:app --port 8000`).
3. Run the app: follow [`frontend/README.md`](./frontend/README.md). It runs on mock data until you point it at the backend.
4. The request and response shapes between the two are in [`frontend/docs/api-contract.md`](./frontend/docs/api-contract.md).
