import { useState } from 'react';
import { Pencil, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-react';
import { createId } from '@/shared/lib/id';
import { useCollection } from '@/shared/storage';
import { Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageContainer, Spinner } from '@/shared/ui';
import { TOOL_ID, visibleNotes, type Note } from './logic';

const textarea =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus-visible:border-accent-500 focus-visible:outline-2 focus-visible:outline-accent-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

export default function NotesPage() {
  const { items, loading, collection } = useCollection<Note>(TOOL_ID, 'notes');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [editText, setEditText] = useState('');
  const [deleting, setDeleting] = useState<Note | null>(null);
  const notes = visibleNotes(items, query);

  return (
    <PageContainer>
      <div className="space-y-5">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            void collection.put({ id: createId(), text: draft.trim(), pinned: false, updatedAt: Date.now() });
            setDraft('');
          }}
        >
          <Field label="New note">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Write it down before you forget" className={textarea} />
          </Field>
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            <Plus className="size-5" aria-hidden /> Add note
          </Button>
        </form>

        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState icon={StickyNote} title="No notes yet" description="Quick thoughts, lists, numbers: anything you want to keep." />
        ) : (
          <>
            <Field label="Search notes" hideLabel>
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" />
            </Field>
            {notes.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No note contains that.</p>}
            <ul className="grid gap-3 sm:grid-cols-2">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className={`flex flex-col rounded-2xl border bg-white pt-3 shadow-sm dark:bg-slate-900 ${
                    note.pinned ? 'border-accent-400 dark:border-accent-600' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <p className="flex-1 px-4 break-words whitespace-pre-wrap">{note.text}</p>
                  <div className="flex justify-end px-1 pb-1">
                    <IconButton
                      label={note.pinned ? 'Unpin note' : 'Pin note to the top'}
                      aria-pressed={note.pinned}
                      onClick={() => void collection.put({ ...note, pinned: !note.pinned })}
                    >
                      {note.pinned ? <PinOff className="size-5" aria-hidden /> : <Pin className="size-5" aria-hidden />}
                    </IconButton>
                    <IconButton
                      label="Edit note"
                      onClick={() => {
                        setEditing(note);
                        setEditText(note.text);
                      }}
                    >
                      <Pencil className="size-5" aria-hidden />
                    </IconButton>
                    <IconButton label="Delete note" onClick={() => setDeleting(note)}>
                      <Trash2 className="size-5" aria-hidden />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit note">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (editing && editText.trim()) {
              void collection.put({ ...editing, text: editText.trim(), updatedAt: Date.now() });
            }
            setEditing(null);
          }}
        >
          <Field label="Note" hideLabel>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={8} className={textarea} />
          </Field>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!editText.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this note?"
        message="It can't be brought back."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void collection.remove(deleting.id);
          setDeleting(null);
        }}
      />
    </PageContainer>
  );
}
