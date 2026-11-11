import { useState } from 'react';
import { Check, Flame, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatISODate, todayISO } from '@/shared/lib/dates';
import { createId } from '@/shared/lib/id';
import { useCollection } from '@/shared/storage';
import { Button, ConfirmDialog, EmptyState, Field, IconButton, Input, PageContainer, Spinner } from '@/shared/ui';
import { lastDays, streak, toggleDay, TOOL_ID, weekdayLetter, type Habit } from './logic';

export default function HabitsPage() {
  const { items, loading, collection } = useCollection<Habit>(TOOL_ID, 'habits');
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const today = todayISO();
  const week = lastDays(today, 7);
  const habits = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const doneToday = habits.filter((h) => h.done.includes(today)).length;

  // Reads the stored habit first: two quick taps would otherwise both start from the same rendered copy and one would be lost.
  async function toggle(id: string, day: string) {
    const habit = await collection.get(id);
    if (habit) await collection.put({ ...habit, done: toggleDay(habit.done, day) });
  }

  return (
    <PageContainer size="sm">
      <div className="space-y-5">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void collection.put({ id: createId(), name: name.trim(), createdAt: Date.now(), done: [] });
            setName('');
          }}
        >
          <Field label="New habit" className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Read 10 pages" maxLength={60} />
          </Field>
          <Button type="submit" variant="primary">
            <Plus className="size-5" aria-hidden /> Add
          </Button>
        </form>

        {loading ? (
          <Spinner />
        ) : habits.length === 0 ? (
          <EmptyState icon={Flame} title="No habits yet" description="Add one small thing you want to do every day." />
        ) : (
          <>
            <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
              {doneToday} of {habits.length} done today
            </p>
            <ul className="space-y-3">
              {habits.map((habit) => {
                const run = streak(habit.done, today);
                return (
                  <li
                    key={habit.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2 pl-1">
                      <p className="min-w-0 flex-1 font-medium break-words">{habit.name}</p>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-sm font-semibold',
                          run > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500',
                        )}
                      >
                        <Flame className="size-4" aria-hidden /> {run} {run === 1 ? 'day' : 'days'}
                      </span>
                      <IconButton label={`Delete "${habit.name}"`} onClick={() => setDeleting(habit)}>
                        <Trash2 className="size-5" aria-hidden />
                      </IconButton>
                    </div>
                    <div className="mt-1 flex gap-1">
                      {week.map((day) => {
                        const done = habit.done.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            aria-pressed={done}
                            aria-label={`${habit.name}, ${day === today ? 'today' : formatISODate(day)}`}
                            onClick={() => void toggle(habit.id, day)}
                            className={cn(
                              'flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-xs font-medium transition-colors',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
                              done
                                ? 'bg-accent-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                              day === today && !done && 'ring-2 ring-accent-500 ring-inset',
                            )}
                          >
                            {weekdayLetter(day)}
                            {done ? <Check className="size-4" aria-hidden /> : <span className="h-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this habit?"
        message={deleting ? `"${deleting.name}" and its history will be deleted.` : null}
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
