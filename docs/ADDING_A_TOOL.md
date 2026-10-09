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

The manifest has exactly these six fields:

| Field | Meaning |
| --- | --- |
| `id` | Unique kebab-case id (also the storage namespace) |
| `name` | Short title for the card and the header |
| `description` | One sentence for the card |
| `icon` | Icon component |
| `route` | Where the tool lives, e.g. `/notes`. Sub-paths like `/notes/anything` also go to your component, so a tool can have internal routes |
| `component` | The root component, wrapped in `React.lazy` and **default-exported** from its file |

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
| Unique ids | `createId()` from `@/shared/lib/id` |
| Calendar dates | `@/shared/lib/dates` (local `YYYY-MM-DD` helpers) |
| Joining class names | `cn()` from `@/shared/lib/cn` |

Styling is Tailwind, mobile first. Dark mode follows the system through `dark:` classes. Keep touch targets at least 44 px (the shared `Button` and `IconButton` already are 48 px).

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
- **A tool that does not store anything** (say, a file converter) simply never calls `useCollection`. Nothing in the shell assumes a tool has data. Work with files via standard browser APIs (`<input type="file">`, `Blob`, `URL.createObjectURL`) inside the tool.
- **A tool that needs a library** (a PDF writer, say) adds it with `npm install`; because the page is lazy-loaded, the library only downloads when the tool is opened.
- **Removing a tool:** delete its folder and its two lines in `registry.ts`. (Its saved data stays in the device's IndexedDB under its id; the storage layer never deletes another tool's data on its own.)
