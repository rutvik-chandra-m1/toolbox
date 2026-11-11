import { useRef } from 'react';
import { GlassWater, Minus, Plus } from 'lucide-react';
import { addDays, formatISODate, todayISO } from '@/shared/lib/dates';
import { useCollection } from '@/shared/storage';
import { Button, IconButton, PageContainer, Spinner } from '@/shared/ui';
import { DEFAULT_GOAL, litres, progress, TOOL_ID, type Glasses } from './logic';

const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

export default function WaterPage() {
  const { items: days, loading, collection } = useCollection<Glasses>(TOOL_ID, 'days');
  const settings = useCollection<Glasses>(TOOL_ID, 'settings');
  const goal = settings.items[0]?.glasses ?? DEFAULT_GOAL;
  const today = todayISO();
  const glassesOn = (day: string) => days.find((d) => d.id === day)?.glasses ?? 0;
  const count = glassesOn(today);
  // Taps are applied one after another to the stored count, so quick taps all count (not the rendered value plus one).
  const queue = useRef(Promise.resolve());
  const addGlasses = (delta: number) => {
    queue.current = queue.current
      .then(async () => {
        const stored = (await collection.get(today))?.glasses ?? 0;
        await collection.put({ id: today, glasses: Math.max(0, stored + delta) });
      })
      .catch((error: unknown) => console.error('Could not save the glass count', error));
  };
  const setGoal = (n: number) => void settings.collection.put({ id: 'goal', glasses: Math.min(30, Math.max(1, n)) });
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  if (loading || settings.loading) return <Spinner />;

  return (
    <PageContainer size="sm">
      <div className="space-y-5">
        <section aria-label="Today" className={`${card} text-center`}>
          <p className="text-5xl font-semibold tabular-nums">
            {count}
            <span className="text-2xl font-normal text-slate-500"> / {goal}</span>
          </p>
          <p role="status" className="mt-1 text-slate-600 dark:text-slate-400">
            {count >= goal ? 'Goal reached today' : `${goal - count} more ${goal - count === 1 ? 'glass' : 'glasses'} to go`} ·{' '}
            {litres(count)}
          </p>
          <div
            role="progressbar"
            aria-label="Water today"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(count, goal)}
            className="mt-4 h-3 rounded-full bg-slate-200 dark:bg-slate-800"
          >
            <div className="h-3 rounded-full bg-sky-500 transition-[width]" style={{ width: `${progress(count, goal) * 100}%` }} />
          </div>
          <div className="mt-5 flex items-center gap-2">
            <IconButton label="Remove a glass" variant="secondary" disabled={count === 0} onClick={() => addGlasses(-1)}>
              <Minus className="size-5" aria-hidden />
            </IconButton>
            <Button variant="primary" className="flex-1" onClick={() => addGlasses(1)}>
              <GlassWater className="size-5" aria-hidden /> Drank a glass
            </Button>
          </div>
        </section>

        <section aria-label="Last 7 days" className={card}>
          <h2 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">Last 7 days</h2>
          <div className="flex h-28 items-end gap-2">
            {week.map((day) => (
              <div key={day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${formatISODate(day)}: ${glassesOn(day)}`}>
                <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">{glassesOn(day)}</span>
                <div
                  className={`w-full rounded-t-md ${glassesOn(day) >= goal ? 'bg-sky-500' : 'bg-sky-300 dark:bg-sky-800'}`}
                  style={{ height: `${Math.max(2, progress(glassesOn(day), goal) * 70)}%` }}
                />
                <span className="text-xs text-slate-500">
                  {new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(new Date(`${day}T12:00`))}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Daily goal" className={`${card} flex items-center gap-2`}>
          <p className="flex-1">
            Daily goal: <span className="font-semibold">{goal} glasses</span>{' '}
            <span className="text-slate-500">({litres(goal)})</span>
          </p>
          <IconButton label="Lower the goal" variant="secondary" onClick={() => setGoal(goal - 1)}>
            <Minus className="size-5" aria-hidden />
          </IconButton>
          <IconButton label="Raise the goal" variant="secondary" onClick={() => setGoal(goal + 1)}>
            <Plus className="size-5" aria-hidden />
          </IconButton>
        </section>
      </div>
    </PageContainer>
  );
}
