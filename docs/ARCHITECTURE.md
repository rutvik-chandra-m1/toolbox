# Toolbox: architecture rules

A personal app that holds many small, unrelated tools (todo today; later things like a Word-to-PDF converter). It runs offline in the browser (PWA) and on Android (Capacitor APK). **Extensibility is the most important design goal**: a new tool must never require changes to the shell or the shared layer.

## Stack

React 19 + TypeScript (**strict**) + Vite · React Router (hash routing) · Tailwind CSS v4 (mobile first, light/dark follows the system) · Dexie (IndexedDB) · vite-plugin-pwa · Capacitor (Android) · Vitest. No backend, no login, fully offline.

## Commands

```bash
npm run dev              # dev server (http://localhost:5173)
npm run build            # tsc -b && vite build  -> dist/ (PWA)
npm test                 # vitest run (must stay green)
npm run typecheck        # tsc -b
npm run android:build    # debug APK -> release/toolbox-debug.apk (needs JDK 21+ and the Android SDK)
npm run android:check    # report whether the JDK / SDK are found
```

Before declaring work done: `npm run build` and `npm test` both pass.

## Layout

```
src/app/      Shell: layout/header, router, home grid, 404. Knows NO tool by name.
src/tools/    One folder per tool (src/tools/todo/ ...). registry.ts = the single list of all tools.
src/shared/   ui/ (components), storage/ (typed interface + Dexie), files/ (pickFile/saveFile/drop target),
              tools/ (manifest type), lib/ (helpers)
android/      Capacitor Android project (committed). Web bundle is synced into it.
scripts/      generate-icons.mjs, build-apk.mjs
docs/         ADDING_A_TOOL.md
```

## The rules (enforced by `src/architecture.test.ts`; do not weaken the test)

1. **Each tool folder exports a manifest** `{ id, name, description, icon, route, component }` (type `ToolManifest` in `src/shared/tools`). `component` is lazy-loaded (`lazy(() => import('./Page'))`, default export). `id` is kebab-case and **equals the folder name**.
2. **`src/tools/registry.ts` is the only list of tools.** The home grid, the routes, the header title and the document title are all generated from it. Never hard-code a tool in `src/app/`.
3. **Adding a tool = a new folder in `src/tools/` + its entry in `registry.ts`** (an import and one list item). Nothing else changes. Follow `docs/ADDING_A_TOOL.md`.
4. **Tools never import from each other**, and never import `src/app/` or `registry.ts`. Shared code goes in `src/shared/`.
5. **`src/shared/` never imports `src/app/` or `src/tools/`.**
6. **`src/app/` reaches into `src/tools/` only through `registry.ts`.**
7. **All storage goes through the typed interface in `src/shared/storage`** (`StorageBackend` → `Collection<T>`: `getAll/get/put/remove/removeMany/clear/watch`). **Only `src/shared/storage/` may import Dexie.** Tools use `useCollection(toolId, name)` or `useStorage().collection(toolId, name)`, so Dexie can later be swapped for a cloud backend without touching a tool. Import from the `@/shared/storage` barrel, not its internal files.
8. A tool's data lives under its own id (`collection(toolId, name)`); tools never read each other's data. Ids and names: letters, digits, `-`, `_` only.
9. Tools may be **file-in / file-out** rather than data lists (`word-to-pdf` is one). The shell and shared layer stay generic: a tool that stores nothing works with no special casing. **Pick and save files only through `@/shared/files`** (`pickFile`, `saveFile`, `useDropTarget`): a blob/`<a download>` save silently fails inside the Android WebView, so `saveFile` writes with the Capacitor Filesystem plugin and opens the share sheet there. Load heavy libraries with dynamic `import()` so they cost nothing at startup.

## Conventions

- **Pure logic in its own file, unit-tested** (see `src/tools/todo/logic.ts` + `logic.test.ts`). Storage access in a small repository over a `Collection` (`repository.ts`), tested against `createMemoryStorage()`. Pages render inside `<StorageProvider backend={createMemoryStorage()}>` in tests.
- A new `StorageBackend` must pass the shared suite: `describeStorageBackend(...)` in `src/shared/storage/collection-contract.ts`.
- **Mobile first.** Touch targets at least 44 px (shared `Button`/`IconButton` are 48 px). Check phone width (about 375 px) and laptop width. Colours need a `dark:` variant; dark mode is the system setting (`prefers-color-scheme`), no manual toggle.
- Use the shared UI (`@/shared/ui`) before writing new components. Dialogs use the native `<dialog>` element.
- Safe-area insets: use the `--inset-*` CSS variables from `src/index.css` (they merge `env(safe-area-inset-*)` with the `--safe-area-inset-*` that Capacitor injects on Android).
- Imports use the `@/` alias for `src/`. TypeScript is strict with `noUncheckedIndexedAccess`; no `any`.
- Dates that mean "a day" (due dates) are local `YYYY-MM-DD` strings, never UTC timestamps (`src/shared/lib/dates.ts`).
- Routing is **hash-based** (`#/todo`) so it works in the Capacitor WebView, as an installed PWA, and on any static host. Vite `base` is `./`.

## Build modes

- `vite build` → `dist/`: the PWA (service worker + manifest via vite-plugin-pwa).
- `vite build --mode native` → `dist-android/`: the same app **without** a service worker, which Capacitor copies into the APK (`webDir` in `capacitor.config.ts`). `npm run android:build` runs this, `cap sync`, then Gradle.
- The laptop PWA and the Android app keep **separate** local databases; there is no sync (no backend).

## Android notes

- App id `app.toolbox.personal`; Capacitor 8 needs **JDK 21+** and Android SDK platform 36. `scripts/build-apk.mjs` finds the JDK (`JAVA_HOME` or Android Studio's JBR, so an old `java` first on `PATH` is fine) and the SDK, and prints OS-specific install steps if one is missing.
- Capacitor plugins in use: `@capacitor/filesystem` and `@capacitor/share` (for `saveFile`; no storage permissions needed, files go to the app cache). Adding a plugin means `npm install` then `npm run android:build` (it runs `cap sync`).
- `vite.config.ts` aliases jsPDF's unused optional imports (`canvg`, `dompurify`, old `html2canvas`) away; do not remove that, it keeps ~370 KB out of the offline cache and the APK.
- Re-run `npm run icons` after changing the artwork in `scripts/generate-icons.mjs`; it rewrites the PWA icons and the Android mipmaps.
- `android/local.properties` and Gradle build output are git-ignored.
