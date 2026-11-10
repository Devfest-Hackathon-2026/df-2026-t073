# DevFest Mobile Frontend (React Native, Android)

React Native app for **Team df-2026-t073** (Google DevFest Tokyo Hackathon 2026). Android is the supported target.

Tankengo is a camera-first Japanese vocabulary app built around place: catch words from the real world, see where you caught them on a map, review them with cues from the place, prepare for your next visit, and rehearse the conversation out loud.

---

## 1. Prerequisites (One-Time Setup)

To build and run the Android application locally, install the following tools:

### Node.js & Watchman
- **Node.js:** `>= 22.11.0` (check with `node -v`)
- **Watchman (macOS):**
  ```bash
  brew install watchman
  ```

### Java Development Kit (JDK 17)
React Native Android requires **JDK 17**:
```bash
brew install --cask zulu@17
```
Add `JAVA_HOME` to your `~/.zshrc` (or `~/.bashrc`):
```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
```

### Android Studio & Android SDK
1. Install [Android Studio](https://developer.android.com/studio).
2. Open **Android Studio → Settings → Languages & Frameworks → Android SDK**:
   - Under **SDK Platforms**, select **Android 14 (UpsideDownCake) / API Level 34** (or the version matching `compileSdkVersion` in `android/build.gradle`).
   - Under **SDK Tools**, check:
     - **Android SDK Build-Tools**
     - **Android Emulator**
     - **Android SDK Platform-Tools**
3. Add `ANDROID_HOME` to your `~/.zshrc`:
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
4. Reload your shell config:
   ```bash
   source ~/.zshrc
   ```

On Windows, the same steps apply with `ANDROID_HOME` pointing at your SDK folder (for example `%LOCALAPPDATA%\Android\Sdk`) and `JAVA_HOME` at the JDK 17 folder.

---

## 2. Install Dependencies

From the repository root, navigate to `frontend/` and install NPM packages:

```bash
cd frontend
npm install
```

**After pulling changes that add native libraries** (anything in `android/`, or new packages such as the camera text reader `react-native-vision-camera-mlkit`, `react-native-worklets`, `react-native-nitro-sound`, `@react-native-community/geolocation`, `@react-native-google-signin/google-signin` or `react-native-svg`): run `npm install`, rebuild the app (`npm run android`), and start Metro once with a clean cache (`npm start -- --reset-cache`).

A stale cache after a Babel plugin change shows up as `Cannot read property 'createWorkletRuntime' of undefined` when the camera opens. A stale **autolinking** cache shows up as `TurboModuleRegistry.getEnforcing(...)` errors for a native module that is installed in `node_modules`. The fix is `cd android && .\gradlew clean`, then `npm run android`.

---

## 3. Running the App Locally (Android)

### Step 1: Start an Android Device
Either:
- Launch an **Android Virtual Device (AVD)** from **Android Studio → Virtual Device Manager**, OR
- Plug in a physical Android phone with **USB Debugging** enabled.

Use an image with **Google Play** (the Play Store icon in the device list). Google sign-in and Maps need Play services.

Verify your device is connected:
```bash
adb devices
```

### Step 2: Start the Metro Bundler & Build the App
In `frontend/`, run:
```bash
npm run android
```
*(This automatically starts the Metro JavaScript bundler and installs the debug APK on your connected emulator or physical device.)*

If you want to run the Metro bundler in a separate terminal tab:
```bash
# Terminal 1: Start Metro
npm start

# Terminal 2: Build & launch Android app
npm run android
```

### Permissions
The app uses the camera (catching words), the microphone (spoken replies in Rehearse) and location (the place you are at, the map). Allow each when Android asks.

---

## 4. Mock data and the backend

The app runs on mock data by default (`src/mocks/`), so every screen works without the backend. Two files control this, and they're easy to mix up:

| File | Read by | Holds |
| :--- | :--- | :--- |
| `frontend/.env` | The app's JavaScript (`babel.config.js`) | `USE_MOCKS`, `LIVE_APIS`, `API_BASE_URL`, `FIREBASE_*`, `GOOGLE_WEB_CLIENT_ID`, optional test user |
| **Repository-root `.env`** | The Android build (`android/app/build.gradle`) | `GOOGLE_MAPS_API_KEY` |

**The Maps key goes in the root `.env`, not `frontend/.env`.** The build ignores `frontend/.env` for it, and the map stays black with no error in the app.

1. Copy `frontend/.env.example` to `frontend/.env`.
2. Either set `USE_MOCKS=false` to call the backend for everything, or keep mocks and list the areas to run live in `LIVE_APIS`. Everything live:
   ```env
   LIVE_APIS=capture,tango,review,user,places,prepare,rehearse
   ```
3. Set `API_BASE_URL` (see below).
4. Fill in the `FIREBASE_*` values from Firebase console › Project settings › Your apps › Web app. Under **Authentication › Sign-in method**, enable Google, Email/Password and Anonymous.
5. For **Google sign-in**, also:
   - register the Android app (`com.devfestapp`) in Firebase with your **SHA-1** and **SHA-256** fingerprints. Debug and release builds both use the committed `android/app/debug.keystore`, so one registration covers the team. From `frontend/`: `keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android`;
   - set `GOOGLE_WEB_CLIENT_ID` in `frontend/.env` to the Web client ID from Authentication › Sign-in method › Google › Web SDK configuration.
6. Add `GOOGLE_MAPS_API_KEY=<key>` to the **root** `.env` (the exact form, no spaces around `=`). Then rebuild the app. A Metro reload doesn't pick up a new Maps key.
7. Restart Metro with a clean cache so the new values are picked up: `npm start -- --reset-cache`.

`API_BASE_URL` defaults to `http://10.0.2.2:8000`, which only works in the emulator:
- **Android emulator:** `10.0.2.2` routes to `localhost` on your computer. Start the backend on port `8000` (`cd ../backend && uv run uvicorn main:app --port 8000`).
- **Phone over USB:** set `API_BASE_URL=http://localhost:8000` and forward both ports after every replug:
  ```bash
  adb reverse tcp:8000 tcp:8000   # backend
  adb reverse tcp:8081 tcp:8081   # Metro
  ```
  This also works for the emulator, so `localhost` is a fine default for both.
- **Cloud Run:** point `API_BASE_URL` at the service URL, using `https://`.

### What each live area does

| `LIVE_APIS` area | Screens it drives |
| :--- | :--- |
| `capture` | Camera: live text reading on the phone, photo reads through the backend, dictionary lookups |
| `tango` | Saving, listing, favouriting and deleting Tango; Tango detail; lists |
| `review` | Review tab, review sessions and results, review summary |
| `user` | Name, reading level and home area in Me; stats |
| `places` | Today, map pins, plans and visits, place search, "where am I" |
| `prepare` | Prepare briefings |
| `rehearse` | Rehearse role-play, staff voice, spoken replies and results |

### Offline use
Requests that fail because the phone is offline are kept in an outbox and sent again once the connection returns. An offline banner shows while this is happening. Reads use the last cached copy when there is one.

### Troubleshooting on a real phone

| Symptom | Cause / fix |
| :--- | :--- |
| `Network request failed` on Today | `API_BASE_URL` still `10.0.2.2`, or `adb reverse` not run since replugging. |
| `HTTP 401` on every request | The phone's clock is off (Firebase tokens are time-stamped): Settings → System → Date & time → Set time automatically. Also check the `FIREBASE_*` values and that the sign-in methods are enabled. |
| `HTTP 503` with "busy, try again" | Gemini is overloaded. The app retries and shows a message; wait a minute and try again. |
| No USB debugging prompt | Settings → About phone → tap Build number 7 times, then Developer options → USB debugging; unlock the phone when plugging in. |
| Rehearse spoken reply → `HTTP 503` naming an API | Cloud Speech-to-Text API not enabled (backend README, Step 4b). |
| `HTTP 429` with a "come back tomorrow" style message | A per-user daily limit on a paid API was used up (limits are in the backend README). |
| Prepare/Rehearse look like mock data | `prepare,rehearse` missing from `LIVE_APIS`. |
| Blank map | `GOOGLE_MAPS_API_KEY` is missing from the **root** `.env`, or the app was built before it was added. Add it there, then run `cd android && .\gradlew clean` and `npm run android`. |
| Google sign-in fails with `DEVELOPER_ERROR` | The SHA-1 or package name isn't registered for the Android app in Firebase, or `GOOGLE_WEB_CLIENT_ID` is the wrong client. Check both, then rebuild. |
| Google sign-in says Play services is missing | Use an emulator image with Google Play, or update Google Play services on the phone. |
| Google sign-in dialog shows accounts and a "Permission requested by …" notice | The account chooser lists the device's signed-in accounts; the app only receives the one you pick. Check the notice's source before approving anything you don't recognise. |
| `TurboModuleRegistry.getEnforcing(...)` for a Google or camera module | The app was built before the native module was installed. Run `cd android && .\gradlew clean`, then `npm run android`. |

Me › Developer shows which mode is active and has a **Check backend health** button (`GET /healthz`).

Every endpoint, request and response shape is listed in [`docs/api-contract.md`](./docs/api-contract.md), including which ones already exist in the backend and which are proposed.

---

## 5. Project Structure

```text
frontend/
├── App.tsx                  # Providers: safe area, auth, settings, navigation
├── index.js                 # React Native entrypoint
├── .env.example             # App settings: USE_MOCKS, LIVE_APIS, API_BASE_URL, FIREBASE_*, GOOGLE_WEB_CLIENT_ID
├── docs/api-contract.md     # API contract to agree with the backend
├── android/                 # Native Android Gradle project (com.devfestapp)
├── __tests__/               # Jest tests (rules, API wording, screens, review, plans)
└── src/
    ├── api/                 # One module per area; each picks mock or fetch (see config.ts)
    ├── auth/                # Firebase init, Google and email/anonymous sign-in, sign-out
    ├── cache/               # Offline cache (storage.ts), outbox for retries (outbox.ts), network state (network.ts)
    ├── audio/               # Microphone recording and staff-voice playback
    ├── components/          # <Jp>, buttons, cards, the map (TangoMap), sheets, offline banner, Hanamaru star
    ├── config.ts            # Reads frontend/.env: mock mode, live areas, API URL, Firebase, Google client ID
    ├── copy.ts              # All user-facing strings
    ├── features/
    │   ├── capture/         # Live text reading (liveText.ts), photo boxes, selection box, detector seam
    │   ├── places/          # Favourite places (heart button, hook)
    │   ├── plans/           # Plan a visit: date/time picker and time presets
    │   ├── review/          # Answer checking, review labels, collection helpers
    │   ├── tango/           # Saving a word from the camera or a lookup; sorting and filtering
    │   └── today/           # First-day steps on Today
    ├── hooks/               # useAsync, useCachedAsync, useOnline, useProfileSync, useReloadOnFocus, useDebouncedValue
    ├── legal/               # Generated licence list for the Me screen
    ├── location/            # Location permission and current position
    ├── mocks/               # Mock data (麺屋 たいき, 食券, 替え玉, 立入禁止, ...)
    ├── navigation/          # Root stack, bottom tabs, route types, path map
    ├── screens/             # auth, capture, map, me, plans, prepare, rehearse, review, tango, today, welcome
    ├── state/               # Auth and Settings contexts (settings saved with AsyncStorage)
    ├── styles/
    │   ├── tokens.ts        # All colors, fonts, sizes, spacing, radii
    │   └── base.ts          # Shared layout primitives (stack, row, card, button, chip)
    ├── types/               # Shared domain types (Tango, Place, Visit, ...) and env declarations
    └── utils/               # Formatting helpers
```

### Styling rules
- Every color, font and size comes from `src/styles/tokens.ts`. Placeholder values until the style guide is final.
- Components use `StyleSheet.create` with token values. Inline styles only for dynamic values (positions, sizes from data).
- All Japanese text goes through `<Jp>` (`src/components/Jp.tsx`), which follows the "Show Japanese as" and furigana settings. Pass `peek` for a dotted underline with long-press English.
- Bottom sheets (`BottomSheet` in `src/components/layout.tsx`) add the system bottom inset to their padding, so content clears the gesture bar.

### Routes
| Screen | Path (deep-link map in `src/navigation/linking.ts`) |
|---|---|
| Today / Plans / Review / Me tabs | `/`, `/plans`, `/review`, `/me` |
| Prepare | `/prepare/:placeId` |
| Rehearse, results | `/rehearse/:placeId`, `/rehearse/:placeId/results` |
| Capture, today's catch | `/capture`, `/capture/today` |
| Tango detail | `/tango/:id` |
| Review session | `/review/session` |
| First run | `/welcome` (Me › Developer › Restart onboarding) |

The `tankengo://` links only work once an intent filter is added to `AndroidManifest.xml`; it isn't there yet.

---

## 6. Useful Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Start the Metro bundler (`--reset-cache` to clear cache) |
| `npm run android` | Compile and run the Android debug build |
| `npm run lint` | Run ESLint across the project |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run the Jest unit tests |
| `npm run build` | Build the production JS bundle into `build/` (checks that Metro can bundle the app) |

The camera uses `react-native-vision-camera` (v5, needs `react-native-nitro-modules` and `react-native-nitro-image`) and gallery import uses `react-native-image-picker`. Both are native modules, so rebuild the app (`npm run android`) after installing. On an emulator without a camera, the Capture screen shows a placeholder and the mock detection still runs.

How capture works:
- **Live mode** reads text on the phone with ML Kit through `react-native-vision-camera-mlkit`. Words you catch this way are saved by text, with no photo. Repeated lines in one frame are shown once.
- **Photo mode** sends the picture to the backend, which reads it with Cloud Vision. Drag across several boxes to join them into one word. Photo catches keep the picture for the fill-the-gap review question.

---

## 7. CI/CD Deployment (Google Cloud Build → Firebase App Distribution)

Android release builds are automated via [`frontend/cloudbuild.yaml`](./cloudbuild.yaml):
1. On push to `main` (affecting `frontend/**`), **Google Cloud Build** runs `npm ci`, writes `frontend/.env` and the root `.env`, runs `npm test`, and runs `./gradlew assembleRelease`.
2. The resulting APK (`android/app/build/outputs/apk/release/app-release.apk`) is published to **Firebase App Distribution** under the `hackathon-testers` group.
3. Team members and judges receive an email invitation (or can open the **Firebase App Tester** Android app) to install the latest build directly on their Android device.

The app reads its settings at **build time**, and both `.env` files are git-ignored. So the Cloud Build job must write the same values, or the distributed APK falls back to mock data, a blank map, or no Google sign-in:
- `frontend/.env`: `USE_MOCKS=false`, `LIVE_APIS`, the `https://` `API_BASE_URL`, `FIREBASE_*`, and **`GOOGLE_WEB_CLIENT_ID`**.
- Root `.env`: **`GOOGLE_MAPS_API_KEY`**, from Secret Manager.
- Do not write `TEST_USER_EMAIL` or `TEST_USER_PASSWORD` into the release build. They would be compiled into the APK.

The release APK is signed with the committed `debug.keystore`, so its SHA-1 must be registered for `com.devfestapp` in Firebase for Google sign-in to work.
