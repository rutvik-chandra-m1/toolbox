import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'spending';

export const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Fun', 'Other'] as const;

export interface Expense extends Entity {
  amount: number;
  category: string;
  note: string;
  /** Local `YYYY-MM-DD`. */
  date: string;
  createdAt: number;
}

/** Parses what was typed ("12", "12.5", "12,50") into a positive amount with at most 2 decimals, else null. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  const value = Number(trimmed);
  return trimmed !== '' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function summarize(expenses: readonly Expense[], today: string) {
  const month = today.slice(0, 7);
  const thisMonth = expenses
    .filter((e) => e.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const sum = (list: readonly Expense[]) => list.reduce((total, e) => total + e.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of thisMonth) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  return {
    today: sum(thisMonth.filter((e) => e.date === today)),
    month: sum(thisMonth),
    /** Largest first. */
    byCategory: [...byCategory].sort((a, b) => b[1] - a[1]),
    /** This month's expenses, newest first. */
    entries: thisMonth,
  };
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
}
