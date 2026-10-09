# Toolbox

A personal collection of small tools in one app. It runs in the browser on a laptop (installable as a PWA) and on an Android phone (as an APK). Everything works **offline**: there is no backend and no login, and your data stays on the device.

Right now it contains one tool, a **todo list**. The app is built so that more, unrelated tools (a Word-to-PDF converter, say) can be dropped in later without touching the rest. See [docs/ADDING_A_TOOL.md](docs/ADDING_A_TOOL.md).

**Stack:** React 19 · TypeScript (strict) · Vite · React Router · Tailwind CSS · Dexie (IndexedDB) · vite-plugin-pwa · Capacitor (Android) · Vitest.

## Run it on your laptop

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Edits reload instantly.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build the production PWA into `dist/` |
| `npm run preview` | Serve `dist/` locally, to try the production build and the service worker |
| `npm test` | Run all tests once (`npm run test:watch` to keep them running) |
| `npm run typecheck` | TypeScript only |
| `npm run icons` | Re-render every app icon (PWA, favicon, Android) from `scripts/generate-icons.mjs` |
| `npm run android:build` | Build the Android debug APK (see below) |
| `npm run android:check` | Report whether the JDK / Android SDK needed for the APK are installed |
| `npm run android:sync` | Rebuild the web bundle and copy it into the Android project |
| `npm run android:open` | Open the Android project in Android Studio |

## Install it as an app on your laptop (PWA)

1. `npm run build && npm run preview`, then open <http://localhost:4173> in Chrome or Edge.
2. Click the install icon in the address bar (or menu → *Install Toolbox*).

The service worker caches the whole app, so it keeps working with no network. To use it day to day without a dev server running, host the `dist/` folder anywhere static (GitHub Pages, Netlify, any web server). It uses hash URLs (`#/todo`) so no server rewrite rules are needed. Browsers only allow installing from `https://` or `localhost`.

## Build the Android APK

```bash
npm run android:build
```

This single command builds the web bundle, syncs it into the Android project, runs Gradle, and writes the APK to:

```
release/toolbox-debug.apk
```

(Gradle's own copy is `android/app/build/outputs/apk/debug/app-debug.apk`.)

**Prerequisites** (the script checks them and tells you exactly what is missing for your OS):

- **JDK 21 or newer.** Windows: `winget install EclipseAdoptium.Temurin.21.JDK`. macOS: `brew install --cask temurin@21`. Linux: `sudo apt install openjdk-21-jdk`.
- **Android SDK** with *Android SDK Platform 36* and Build-Tools 36. Easiest: install [Android Studio](https://developer.android.com/studio), open it once, and let it download the SDK. The script finds it in the default location, or via `ANDROID_HOME`.
- Internet on the first build (Gradle and the Android libraries download once, about 300 MB).

If a JDK or SDK is missing, the script still builds and syncs the web part, prints what to install, and exits. Install it, then run `npm run android:build` again.

### Install the APK on your phone

- **By file:** copy `toolbox-debug.apk` to the phone (USB, cloud drive, or email to yourself), open it, and allow *Install unknown apps* for the app you opened it from when Android asks.
- **By USB:** enable *Developer options → USB debugging* on the phone, plug it in, and run `adb install -r release/toolbox-debug.apk` (`adb` lives in the SDK's `platform-tools`).

It is a *debug* build signed with a local debug key: fine for your own phone, not for the Play Store (that needs a signed release build). Requires Android 7.0 or newer. Updating later: build a new APK and install it over the old one; your data is kept.

### Good to know about data

- Data lives in **IndexedDB on each device**. The laptop PWA, the browser tab, and the phone app each have their **own separate** copy; nothing syncs between them (there is no backend).
- Clearing the browser's site data, or uninstalling the Android app, deletes the tasks.
- Because all storage goes through one interface (`src/shared/storage`), adding sync later means writing one new backend and changing no tool code.

## Project layout

```
src/
  app/        Shell: layout + header, router, home screen, 404. Knows no tool by name.
  tools/      One folder per tool (todo/ today). registry.ts is the ONE list of tools.
  shared/     Reusable code: ui/ (components), storage/ (typed interface + Dexie),
              tools/ (the manifest type), lib/ (helpers)
android/      Capacitor's Android project (generated once, committed)
scripts/      generate-icons.mjs, build-apk.mjs
docs/         ADDING_A_TOOL.md
```

The rules that keep it extensible (tools never import each other, only `shared/storage` touches Dexie, the shell only reads the registry) are written down in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and **enforced by a test** (`src/architecture.test.ts`), so breaking one fails `npm test`.

## Testing

`npm test` runs about 110 tests: the todo logic and repository, both storage backends against one shared contract suite, persistence across a simulated restart, the generated home screen and routes, the full todo UI, and the architecture rules.

## Troubleshooting

- **`npm run android:build` says JDK/SDK not found:** follow the printed instructions, then re-run. `npm run android:check` shows what was detected.
- **Gradle says a licence was not accepted:** run `sdkmanager --licenses` (in `<SDK>/cmdline-tools/latest/bin`) and accept all.
- **Java 8 is first on your `PATH`:** fine. The script prefers `JAVA_HOME` (or Android Studio's bundled JDK) when it is Java 21+.
- **Phone shows the old version after an update:** install the new APK over it (same package name `app.toolbox.personal`).
