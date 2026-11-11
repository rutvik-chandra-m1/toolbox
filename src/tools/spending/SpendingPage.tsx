import { useState } from 'react';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { formatISODate, todayISO } from '@/shared/lib/dates';
import { createId } from '@/shared/lib/id';
import { useCollection } from '@/shared/storage';
import { Button, EmptyState, Field, IconButton, Input, PageContainer, Select, Spinner } from '@/shared/ui';
import { CATEGORIES, formatMoney, parseAmount, summarize, TOOL_ID, type Expense } from './logic';

const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

export default function SpendingPage() {
  const { items, loading, collection } = useCollection<Expense>(TOOL_ID, 'expenses');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState(false);
  const today = todayISO();
  const summary = summarize(items, today);

  return (
    <PageContainer size="sm">
      <div className="space-y-5">
        <form
          className={`${card} space-y-3`}
          onSubmit={(event) => {
            event.preventDefault();
            const value = parseAmount(amount);
            setError(value === null);
            if (value === null) return;
            void collection.put({ id: createId(), amount: value, category, note: note.trim(), date: today, createdAt: Date.now() });
            setAmount('');
            setNote('');
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-invalid={error}
              />
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Lunch" maxLength={80} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Enter an amount above zero.
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full">
            <Plus className="size-5" aria-hidden /> Add expense
          </Button>
        </form>

        <div className="grid grid-cols-2 gap-3">
          <div className={card}>
            <p className="text-sm text-slate-600 dark:text-slate-400">Today</p>
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(summary.today)}</p>
          </div>
          <div className={card}>
            <p className="text-sm text-slate-600 dark:text-slate-400">This month</p>
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(summary.month)}</p>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : summary.entries.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing spent this month" description="Add each expense as it happens; it takes five seconds." />
        ) : (
          <>
            <section aria-label="By category" className={`${card} space-y-2`}>
              {summary.byCategory.map(([name, total]) => (
                <div key={name}>
                  <div className="flex justify-between text-sm">
                    <span>{name}</span>
                    <span className="tabular-nums">{formatMoney(total)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className="h-2 rounded-full bg-accent-600" style={{ width: `${(total / summary.month) * 100}%` }} />
                  </div>
                </div>
              ))}
            </section>

            <ul className="space-y-2">
              {summary.entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white py-1 pr-1 pl-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1 py-2">
                    <p className="break-words">{e.note || e.category}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {e.date === today ? 'Today' : formatISODate(e.date)} · {e.category}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatMoney(e.amount)}</span>
                  <IconButton label={`Delete ${e.note || e.category} ${formatMoney(e.amount)}`} onClick={() => void collection.remove(e.id)}>
                    <Trash2 className="size-5" aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PageContainer>
  );
}
