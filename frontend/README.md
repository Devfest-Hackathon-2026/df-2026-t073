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

## 4. Connecting to the Local FastAPI Backend

By default, [`src/services/api.ts`](./src/services/api.ts) points to:
```ts
export const API_BASE_URL = 'http://10.0.2.2:8000';
```
- **On an Android Emulator:** `10.0.2.2` automatically routes to `localhost` (`127.0.0.1`) on your host computer. Start the FastAPI backend on port `8000` (`cd ../backend && uv run uvicorn main:app --reload`) and tap **"Check Backend Health"** in the app.
- **On a Physical Android Device:** Forward port `8000` over USB using `adb reverse` so the phone can reach your computer's local backend:
  ```bash
  adb reverse tcp:8000 tcp:8000
  ```
  *(Or replace `API_BASE_URL` with your deployed Cloud Run backend URL.)*

---

## 5. Project Structure

```text
frontend/
├── App.tsx                  # Root component & SafeAreaProvider
├── index.js                 # React Native entrypoint
├── cloudbuild.yaml          # Google Cloud Build -> Firebase App Distribution pipeline
├── android/                 # Native Android Gradle project (com.devfestapp)
└── src/
    ├── components/          # Reusable UI components
    ├── navigation/          # App navigation stacks/tabs
    ├── screens/
    │   └── HomeScreen.tsx   # Main screen with backend health check
    └── services/
        └── api.ts           # Backend API client
```

---

## 6. Useful Scripts

| Command | Description |
| :--- | :--- |
| `npm start` | Start the Metro bundler (`--reset-cache` to clear cache) |
| `npm run android` | Compile and run the Android debug build |
| `npm test` | Run Jest unit tests |
| `npm run lint` | Run ESLint across the project |

---

## 7. CI/CD Deployment (Google Cloud Build → Firebase App Distribution)

Android release builds are automated via [`frontend/cloudbuild.yaml`](./cloudbuild.yaml):
1. On push to `main` (affecting `frontend/**`), **Google Cloud Build** runs `npm ci`, `npm test`, and `./gradlew assembleRelease`.
2. The resulting APK (`android/app/build/outputs/apk/release/app-release.apk`) is published to **Firebase App Distribution** under the `hackathon-testers` group.
3. Team members and judges receive an email invitation (or can open the **Firebase App Tester** Android app) to install the latest build directly on their Android device.
