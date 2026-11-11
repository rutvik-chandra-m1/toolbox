import { describe, expect, it } from 'vitest';
import { parseAmount, summarize, type Expense } from './logic';

const expense = (amount: number, category: string, date: string, createdAt = 0): Expense => ({
  id: `${date}-${amount}`,
  amount,
  category,
  note: '',
  date,
  createdAt,
});

describe('spending logic', () => {
  it('parses amounts and rejects junk, zero and negatives', () => {
    expect(parseAmount(' 12 ')).toBe(12);
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('0.999')).toBe(1);
    for (const bad of ['', 'abc', '0', '-5', '1e999']) expect(parseAmount(bad)).toBeNull();
  });

  it('totals today and this month only, with categories largest first', () => {
    const summary = summarize(
      [
        expense(10, 'Food', '2026-03-05'),
        expense(40, 'Bills', '2026-03-02'),
        expense(5, 'Food', '2026-03-02'),
        expense(99, 'Fun', '2026-02-28'),
      ],
      '2026-03-05',
    );
    expect(summary.today).toBe(10);
    expect(summary.month).toBe(55);
    expect(summary.byCategory).toEqual([
      ['Bills', 40],
      ['Food', 15],
    ]);
    expect(summary.entries.map((e) => e.amount)).toEqual([10, 40, 5]);
  });
});
