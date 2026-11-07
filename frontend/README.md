# DevFest Mobile Frontend (React Native — Android)

This directory contains the barebones React Native mobile application for **Team df-2026-t073** (Google DevFest Tokyo Hackathon 2026).

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

---

## 2. Install Dependencies

From the repository root, navigate to `frontend/` and install NPM packages:

```bash
cd frontend
npm install
```

---

## 3. Running the App Locally (Android)

### Step 1: Start an Android Device
Either:
- Launch an **Android Virtual Device (AVD)** from **Android Studio → Virtual Device Manager**, OR
- Plug in a physical Android phone with **USB Debugging** enabled.

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

---

## 4. Mock data and the backend

The app runs on mock data by default (`src/mocks/`), so every screen works without the backend.

1. Copy `frontend/.env.example` to `frontend/.env`.
2. Set `USE_MOCKS=false` to call the backend, and `API_BASE_URL` to its URL.
3. Restart Metro with a clean cache so the new values are picked up: `npm start -- --reset-cache`.

`API_BASE_URL` defaults to `http://10.0.2.2:8000`:
- **Android emulator:** `10.0.2.2` routes to `localhost` on your computer. Start the backend on port `8000` (`cd ../backend && uv run uvicorn main:app --reload`).
- **Physical device:** forward the port with `adb reverse tcp:8000 tcp:8000`, or point `API_BASE_URL` at the Cloud Run URL.

Me › Developer shows which mode is active and has a **Check backend health** button (`GET /healthz`).

Every endpoint, request and response shape is listed in [`docs/api-contract.md`](./docs/api-contract.md), including which ones already exist in the backend and which are proposed.

---

## 5. Project Structure

```text
frontend/
├── App.tsx                  # Providers: safe area, settings, navigation
├── index.js                 # React Native entrypoint
├── .env.example             # USE_MOCKS, API_BASE_URL (names only)
├── docs/api-contract.md     # API contract to agree with the backend
├── android/                 # Native Android Gradle project (com.devfestapp)
└── src/
    ├── api/                 # One module per area; each picks mock or fetch
    ├── mocks/               # Mock data (麺屋 たいき, 食券, 替え玉, 立入禁止, ...)
    ├── types/               # Shared domain types (Tango, Place, Visit, ...)
    ├── styles/
    │   ├── tokens.ts        # All colors, fonts, sizes, spacing, radii
    │   └── base.ts          # Shared layout primitives (stack, row, card, button, chip)
    ├── state/               # Settings context, saved with AsyncStorage
    ├── components/          # <Jp>, buttons, chips, cards, screen scaffolding
    ├── features/capture/    # Detector seam (mock now, ML Kit later) + selection box
    ├── navigation/          # Root stack, bottom tabs, route types, path map
    └── screens/             # today, plans, prepare, rehearse, capture, tango, review, me, welcome
```

### Styling rules
- Every color, font and size comes from `src/styles/tokens.ts`. Placeholder values until the style guide is final.
- Components use `StyleSheet.create` with token values. Inline styles only for dynamic values (positions, sizes from data).
- All Japanese text goes through `<Jp>` (`src/components/Jp.tsx`), which follows the "Show Japanese as" and furigana settings. Pass `peek` for a dotted underline with long-press English.

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

---

## 6. Useful Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Start the Metro bundler (`--reset-cache` to clear cache) |
| `npm run android` | Compile and run the Android debug build |
| `npm run lint` | Run ESLint across the project |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run Jest unit tests |
| `npm run build` | Build the production JS bundle into `build/` (checks that Metro can bundle the app) |

The camera uses `react-native-vision-camera` (v5, needs `react-native-nitro-modules` and `react-native-nitro-image`) and gallery import uses `react-native-image-picker`. Both are native modules, so rebuild the app (`npm run android`) after installing. On an emulator without a camera, the Capture screen shows a placeholder and the mock detection still runs.

---

## 7. CI/CD Deployment (Google Cloud Build → Firebase App Distribution)

Android release builds are automated via [`frontend/cloudbuild.yaml`](./cloudbuild.yaml):
1. On push to `main` (affecting `frontend/**`), **Google Cloud Build** runs `npm ci`, `npm test`, and `./gradlew assembleRelease`.
2. The resulting APK (`android/app/build/outputs/apk/release/app-release.apk`) is published to **Firebase App Distribution** under the `hackathon-testers` group.
3. Team members and judges receive an email invitation (or can open the **Firebase App Tester** Android app) to install the latest build directly on their Android device.
