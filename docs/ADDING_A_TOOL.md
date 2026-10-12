# Adding a tool

Adding a tool takes two things:

1. **A new folder** `src/tools/<id>/`
2. **One entry in** [`src/tools/registry.ts`](../src/tools/registry.ts) (an `import` line plus the name in the list)

You do **not** touch the shell (`src/app/`), the router, the home screen, or the shared layer. The home card, the route, the header title and the back button all appear on their own, because the shell is generated from the registry.

## Step by step

The example below adds a tiny **Notes** tool. Replace "notes" with your tool's name.

### 1. Pick an id

A short, lowercase, kebab-case word: `notes`, `word-to-pdf`. It is used as:

- the folder name (`src/tools/notes/`), which a test enforces,
- the tool's id in the manifest,
- the namespace for everything the tool stores (so two tools can never overwrite each other's data).

### 2. Create the folder with a manifest: `src/tools/notes/index.ts`

```ts
import { lazy } from 'react';
import { StickyNote } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const notesTool: ToolManifest = {
  id: 'notes',
  name: 'Notes',
  description: 'Jot things down.',
  icon: StickyNote, // any component that accepts `className`; lucide-react has thousands
  route: '/notes', // absolute, lowercase; may not be "/"
  component: lazy(() => import('./NotesPage')), // code-split: loads only when opened
};
```

The manifest has these six fields, plus one optional one:

| Field | Meaning |
| --- | --- |
| `id` | Unique kebab-case id (also the storage namespace) |
| `name` | Short title for the card and the header |
| `description` | One sentence for the card |
| `icon` | Icon component |
| `route` | Where the tool lives, e.g. `/notes`. Sub-paths like `/notes/anything` also go to your component, so a tool can have internal routes |
| `component` | The root component, wrapped in `React.lazy` and **default-exported** from its file |
| `onAppStart` | *Optional.* Runs once every time the app opens, whatever screen it opens on, e.g. to re-arm reminders. Keep it cheap: `import()` the real work inside it. See `src/tools/notifier/index.ts` |

### 3. Write the page: `src/tools/notes/NotesPage.tsx`

The page must be the file's **default export**. It renders inside the shell's header; start with `<PageContainer>` for the standard width and gutters.

```tsx
import { useState } from 'react';
import { createId } from '@/shared/lib/id';
import { useCollection } from '@/shared/storage';
import { Button, Field, Input, PageContainer } from '@/shared/ui';

interface Note {
  id: string; // every stored record needs a string id
  text: string;
}

export default function NotesPage() {
  // (toolId, collectionName): the same id you gave the manifest.
  const { items, collection } = useCollection<Note>('notes', 'items');
  const [text, setText] = useState('');

  return (
    <PageContainer>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          void collection.put({ id: createId(), text: text.trim() });
          setText('');
        }}
      >
        <Field label="Note" className="flex-1">
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary">
          Add
        </Button>
      </form>

      <ul className="mt-4 space-y-2">
        {items.map((note) => (
          <li key={note.id}>{note.text}</li>
        ))}
      </ul>
    </PageContainer>
  );
}
```

`useCollection` returns the live list (it re-renders after every write, even from another tab) and the `collection` to write to (`put`, `remove`, `removeMany`, `clear`).

### 4. Register it: `src/tools/registry.ts`

```ts
import { defineRegistry } from '@/shared/tools';
import { notesTool } from './notes';   // <- add
import { todoTool } from './todo';

export const tools = defineRegistry([
  todoTool,
  notesTool,                            // <- add (order here is the order on the home screen)
]);
```

`defineRegistry` checks the list when the app loads: a duplicate id or route, or a malformed manifest, throws a clear error.

### 5. Check it

```bash
npm run dev      # a "Notes" card is on the home screen; open it
npm test         # includes the registry and architecture checks
npm run build    # type-checks everything
```

That is the whole job. The Android app and the PWA pick the tool up on their next build with no extra steps.

## What the shared layer gives you

| Need | Use |
| --- | --- |
| Buttons, dialogs, form fields, empty state, segmented control, error boundary, page width | `@/shared/ui` (`Button`, `IconButton`, `ConfirmDialog`, `Dialog`, `Field`, `Input`, `Select`, `Segmented`, `EmptyState`, `Spinner`, `PageContainer`, `ErrorBoundary`) |
| Persisting data | `@/shared/storage`: `useCollection(toolId, name)` in components, or `useStorage().collection(toolId, name)` anywhere you have React context |
| Letting the user **pick a file**, **give a file back**, or drop one on the page | `@/shared/files`: `pickFile(acceptedTypes)`, `saveFile(blob, filename)`, `useDropTarget(...)`. See [File helpers](#file-helpers-for-tools-that-take-or-produce-files) below |
| **Notifications at a set time** (reminders, timers) | `@/shared/notifications`: `getNotificationService()`. See [Notification service](#notification-service) below |
| Showing a file size / making a safe file name | `formatFileSize(bytes)`, `sanitizeFilename(name)` from `@/shared/files` |
| Unique ids | `createId()` from `@/shared/lib/id` |
| Calendar dates | `@/shared/lib/dates` (local `YYYY-MM-DD` helpers) |
| Joining class names | `cn()` from `@/shared/lib/cn` |

Styling is Tailwind, mobile first. Dark mode follows the system through `dark:` classes. Keep touch targets at least 44 px (the shared `Button` and `IconButton` already are 48 px).

## File helpers (for tools that take or produce files)

Tools like **Word to PDF** are *file in, file out*: they store nothing, they read a file the user picks and hand a new file back. Use these helpers from `@/shared/files` instead of writing your own, because the obvious browser tricks do not all work inside the Android app.

```ts
import { isNativePlatform, pickFile, saveFile, useDropTarget } from '@/shared/files';
```

| Helper | What it does |
| --- | --- |
| `pickFile(acceptedTypes)` | Opens the system file chooser and resolves with the chosen `File`, or `null` if the user cancelled. Pass extensions **and** MIME types, e.g. `['.pdf', 'application/pdf']` (Android pickers filter by MIME type). Call it from a click handler. Works in the browser and in the Android app. Always validate the file you get back: the filter is only a hint. |
| `saveFile(blob, filename)` | Gives the user the file. **Browser:** a normal download. **Android app:** blob downloads do not work inside the Capacitor WebView, so it writes the file with the Filesystem plugin (app cache) and opens the system **share sheet** with the Share plugin, from which the user can open it, save it to Files/Drive, or send it. The platform is detected at runtime, the file name is sanitised, and dismissing the share sheet is not treated as an error. Resolves with `{ method: 'download' \| 'share', uri? }`. |
| `useDropTarget({ onDropFiles, disabled })` | Hook for drag-and-drop on a laptop. Spread the returned `handlers` on an element; `dragging` is true while a file is held over it. Only drags that carry files react. |
| `isNativePlatform()` | `true` inside the Android app. Use it only for wording (such as "Open / Share" versus "Download again"); `saveFile` already handles the behaviour. |
| `formatFileSize(bytes)` | `"3.2 MB"` |
| `sanitizeFilename(name)` | Removes characters that are illegal in file names on Windows/Android. |

A minimal file-in / file-out tool:

```tsx
const picked = await pickFile(['.txt', 'text/plain']);
if (!picked) return; // cancelled
const result = new Blob([(await picked.text()).toUpperCase()], { type: 'text/plain' });
await saveFile(result, 'LOUD.txt'); // download on a laptop, share sheet on the phone
```

Things to know:

- **Do not** save with `<a download href={URL.createObjectURL(blob)}>` yourself, or `window.open(blobUrl)`: it works in a browser and silently does nothing in the Android app. Use `saveFile`.
- **Load heavy libraries on demand** with a dynamic `import()` inside the function that needs them (as Word to PDF does for docx-preview, html2canvas-pro and jsPDF), so they cost nothing at startup and only download when the tool is used. Vite splits them into their own chunks automatically, and the PWA caches them for offline use.
- **Validate before you process.** Check the extension and size first, then look at the file's first bytes (a `.docx` is a ZIP, `PK\x03\x04`), and give a specific message for each failure. See `src/tools/word-to-pdf/logic.ts` for a worked, tested example.
- **Rendering untrusted documents:** if you display content from a file the user picked, do it in a `sandbox`ed iframe (no `allow-scripts`) rather than injecting it into the page. See `renderFrame.ts` in the Word to PDF tool.
- **Worked example:** `src/tools/word-to-pdf/` is a complete tool built on all of the above, with a lazy page, page-level tests that mock the converter, and a pure `logic.ts`.

## Notification service

`@/shared/notifications` shows a notification at a chosen time on both platforms; the Notifier tool is built on it.

```ts
import { getNotificationService } from '@/shared/notifications';

const notifications = getNotificationService(); // Android or browser, picked at runtime
if ((await notifications.checkPermission()) === 'prompt') await notifications.requestPermission();
await notifications.schedule('my-tool-123', 'Reminder', 'Water the plants', new Date(2030, 0, 1, 9, 0), { route: '/my-tool' });
await notifications.cancel('my-tool-123');
```

| Method | What it does |
| --- | --- |
| `requestPermission()` / `checkPermission()` | `'granted' | 'denied' | 'prompt' | 'unsupported'`. Ask the first time it is needed (for example on the first save), and show a banner when it is denied. |
| `schedule(id, title, body, date, { route })` | Shows `title` (large, bold) and `body` exactly as given at `date`. Pass `''` as `body` for a single big line of text (Notifier does). On Android a title longer than about 40 characters is then shown as expandable body text instead, since Android cuts titles to one line. Re-using an id replaces the earlier one. `route` is the screen tapping the notification opens. |
| `cancel(id)` | Cancels it. |
| `listPending()` | What is still scheduled. |
| `canScheduleExact()` / `openExactAlarmSettings()` | Android 12+: whether exact timing is allowed, and a shortcut to the "Alarms & reminders" setting. Always true / no-op in a browser. |
| `firesWhenClosed` | `true` on Android (the OS delivers it, app closed or phone locked). `false` in a browser: timers only run while the app is open, so tell the user. |
| `onDelivered(listener)` | Browser only: called when the app itself showed a notification (useful to tell "sent" from "missed"). |

Things to know:

- **Use string ids prefixed with your tool id** (`notifier-...`): every tool shares the one service. On Android the id is hashed to the 32-bit number Android needs.
- **Store what you schedule in your own collection, and re-schedule it from `onAppStart`** (see `src/tools/notifier/startup.ts`). Browser timers die when the page closes, and Android loses alarms if the app is force-stopped. The Android plugin re-arms alarms after a phone restart on its own.
- **Never resolve a promise with a Capacitor plugin object** (`return LocalNotifications` from an `async` function): plugins are proxies that answer `.then`, so the promise never settles. Wrap it (`return { ln: LocalNotifications }`). This bit the first Android build of this service.
- Android permissions (`POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`) and the status-bar icon (`res/drawable/ic_stat_notify.xml`) are already set up.

## Rules (a test fails if you break them)

`src/architecture.test.ts` reads every import in the project and fails with the file and the offending line.

- **Tools never import from each other.** If two tools need the same code, move it to `src/shared/`.
- **Tools never import `src/app/` or `src/tools/registry.ts`.** The dependency only points one way: shell → registry → tool.
- **`src/shared/` never imports `src/app/` or `src/tools/`.**
- **Only `src/shared/storage/` imports Dexie.** Tools use the typed `Collection` interface, never IndexedDB directly, so the storage backend can be swapped without touching tools. Import from `@/shared/storage`, not its internal files.
- **Collection names and tool ids** may contain only letters, digits, `-` and `_`.

## Tips

- **Keep logic out of components.** Put rules (validation, sorting, formatting) in plain functions in their own file (see `src/tools/todo/logic.ts`) and test them with Vitest. Put reads/writes in a small repository over a `Collection` (see `src/tools/todo/repository.ts`) so you can test them against `createMemoryStorage()`.
- **Test the page** by rendering it inside `<StorageProvider backend={createMemoryStorage()}>` (see `src/tools/todo/TodoPage.test.tsx`).
- **Nested screens:** your component can use React Router's `<Routes>` for paths below your `route`; they match relative to it.
- **A tool that does not store anything** (say, a file converter) simply never calls `useCollection`. Nothing in the shell assumes a tool has data. For files, use the [file helpers](#file-helpers-for-tools-that-take-or-produce-files).
- **A tool that needs a library** (a PDF writer, say) adds it with `npm install`; because the page is lazy-loaded, the library only downloads when the tool is opened.
- **Removing a tool:** delete its folder and its two lines in `registry.ts`. (Its saved data stays in the device's IndexedDB under its id; the storage layer never deletes another tool's data on its own.)
