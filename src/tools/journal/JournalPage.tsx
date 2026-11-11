import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatISODate, isValidISODate, todayISO } from '@/shared/lib/dates';
import { useCollection, type Collection } from '@/shared/storage';
import { Button, Field, Input, PageContainer, Spinner } from '@/shared/ui';
import { isBlank, MOODS, newestFirst, preview, TOOL_ID, type Entry } from './logic';

const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

export default function JournalPage() {
  const { items, loading, collection } = useCollection<Entry>(TOOL_ID, 'entries');
  const today = todayISO();
  const [date, setDate] = useState(today);

  if (loading) return <Spinner />;

  return (
    <PageContainer size="sm">
      <div className="space-y-5">
        <Field label="Day">
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => isValidISODate(e.target.value) && e.target.value <= today && setDate(e.target.value)}
          />
        </Field>

        {/* Keyed by day, so picking another day starts from that day's saved entry. */}
        <Editor key={date} date={date} entry={items.find((e) => e.id === date)} collection={collection} />

        <section aria-label="Past days">
          <h2 className="mb-2 text-lg font-semibold">
            Past days <span className="font-normal text-slate-500">({items.length})</span>
          </h2>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing written yet. A line a day is enough.</p>
          ) : (
            <ul className="space-y-2">
              {newestFirst(items).map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDate(entry.id);
                      window.scrollTo({ top: 0 });
                    }}
                    className={cn(
                      'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left dark:border-slate-800 dark:bg-slate-900',
                      'hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-accent-500 dark:hover:bg-slate-800',
                      entry.id === date && 'border-accent-500 dark:border-accent-500',
                    )}
                  >
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {entry.id === today ? 'Today' : formatISODate(entry.id)} {MOODS[entry.mood - 1]?.emoji}
                    </span>
                    <span className="block break-words">{preview(entry.text) || 'No words, just a mood.'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function Editor({ date, entry, collection }: { date: string; entry: Entry | undefined; collection: Collection<Entry> }) {
  const [text, setText] = useState(entry?.text ?? '');
  const [mood, setMood] = useState(entry?.mood ?? 0);
  const [saved, setSaved] = useState(false);
  const dirty = text !== (entry?.text ?? '') || mood !== (entry?.mood ?? 0);

  async function save() {
    const next: Entry = { id: date, text: text.trim(), mood };
    // Saving an emptied day removes it instead of keeping a blank entry.
    await (isBlank(next) ? collection.remove(date) : collection.put(next));
    setText(next.text);
    setSaved(true);
  }

  return (
    <section aria-label="Entry" className={`${card} space-y-3`}>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">How was the day?</legend>
        <div className="flex gap-1">
          {MOODS.map((m, i) => (
            <button
              key={m.label}
              type="button"
              aria-label={m.label}
              aria-pressed={mood === i + 1}
              title={m.label}
              onClick={() => {
                setMood(mood === i + 1 ? 0 : i + 1);
                setSaved(false);
              }}
              className={cn(
                'min-h-12 flex-1 rounded-xl text-2xl transition-colors focus-visible:outline-2 focus-visible:outline-accent-500',
                mood === i + 1 ? 'bg-accent-100 ring-2 ring-accent-500 dark:bg-accent-950' : 'bg-slate-100 dark:bg-slate-800',
              )}
            >
              {m.emoji}
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="What happened?">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          rows={5}
          placeholder="A line or two about the day"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus-visible:border-accent-500 focus-visible:outline-2 focus-visible:outline-accent-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!dirty} onClick={() => void save()}>
          Save
        </Button>
        <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
          {dirty ? 'Not saved yet' : saved ? 'Saved' : ''}
        </p>
      </div>
    </section>
  );
}
