import { useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { formatISODate, isValidISODate, todayISO } from '@/shared/lib/dates';
import { createId } from '@/shared/lib/id';
import { useCollection } from '@/shared/storage';
import { Button, EmptyState, Field, IconButton, Input, PageContainer, Spinner } from '@/shared/ui';
import { countdowns, describeDays, TOOL_ID, type DayEvent } from './logic';

export default function DaysUntilPage() {
  const { items, loading, collection } = useCollection<DayEvent>(TOOL_ID, 'events');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [yearly, setYearly] = useState(false);
  const today = todayISO();

  return (
    <PageContainer size="sm">
      <div className="space-y-5">
        <form
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !isValidISODate(date)) return;
            void collection.put({ id: createId(), name: name.trim(), date, yearly });
            setName('');
            setDate('');
            setYearly(false);
          }}
        >
          <Field label="What">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Exam, trip, Mum's birthday" maxLength={60} required />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} className="size-5 accent-accent-600" />
            Repeats every year
          </label>
          <Button type="submit" variant="primary" className="w-full">
            <Plus className="size-5" aria-hidden /> Add
          </Button>
        </form>

        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nothing to count down to" description="Add a date you are waiting for, or one you don't want to forget." />
        ) : (
          <ul className="space-y-2">
            {countdowns(items, today).map(({ event, on, days }) => (
              <li
                key={event.id}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white py-1 pr-1 pl-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="min-w-0 flex-1 py-2">
                  <p className="font-medium break-words">{event.name}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {formatISODate(on)}
                    {event.yearly && ' · every year'}
                  </p>
                </div>
                <span
                  className={`text-right font-semibold ${
                    days < 0 ? 'text-slate-500' : days <= 7 ? 'text-accent-600 dark:text-accent-400' : ''
                  }`}
                >
                  {describeDays(days)}
                </span>
                <IconButton label={`Delete "${event.name}"`} onClick={() => void collection.remove(event.id)}>
                  <Trash2 className="size-5" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
