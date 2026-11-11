import { useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Field, IconButton, Input, PageContainer, Select } from '@/shared/ui';
import { CATEGORIES, convert, formatResult, unitsOf, type Category } from './logic';

export default function ConverterPage() {
  const [category, setCategory] = useState<Category>('Length');
  const [from, setFrom] = useState('km');
  const [to, setTo] = useState('mile');
  const [value, setValue] = useState('1');
  const units = unitsOf(category);
  const number = Number(value.trim().replace(',', '.'));
  const result = value.trim() === '' ? '' : formatResult(convert(number, category, from, to));

  return (
    <PageContainer size="sm">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Field label="Convert">
          <Select
            value={category}
            onChange={(e) => {
              const next = e.target.value as Category;
              setCategory(next);
              setFrom(unitsOf(next)[0] ?? '');
              setTo(unitsOf(next)[1] ?? '');
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-[1fr_7.5rem] gap-2">
          <Field label="Value">
            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="From">
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex justify-center">
          <IconButton
            label="Swap units"
            variant="secondary"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            <ArrowUpDown className="size-5" aria-hidden />
          </IconButton>
        </div>

        <div className="grid grid-cols-[1fr_7.5rem] items-end gap-2">
          <output
            aria-label="Result"
            className="flex min-h-12 items-center overflow-x-auto rounded-xl bg-slate-100 px-3 text-2xl font-semibold tabular-nums dark:bg-slate-800"
          >
            {result || <span className="text-base font-normal text-slate-500">Enter a number</span>}
          </output>
          <Field label="To">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </PageContainer>
  );
}
