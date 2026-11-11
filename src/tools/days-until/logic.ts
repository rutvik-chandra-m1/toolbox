import { isValidISODate, parseISODate } from '@/shared/lib/dates';
import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'days-until';

export interface DayEvent extends Entity {
  name: string;
  /** Local `YYYY-MM-DD`. */
  date: string;
  /** Repeats every year (birthdays, anniversaries). */
  yearly: boolean;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [a, b] = [parseISODate(from), parseISODate(to)];
  if (!a || !b) return 0;
  // Rounding absorbs the hour a daylight-saving change adds or removes.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** The date to count to: for a yearly event that has passed, its next anniversary. */
export function nextOccurrence(event: Pick<DayEvent, 'date' | 'yearly'>, today: string): string {
  if (!event.yearly || event.date >= today) return event.date;
  const year = Number(today.slice(0, 4));
  // A 29 February event is counted on 28 February in years without one.
  const inYear = (y: number) => {
    const candidate = `${y}${event.date.slice(4)}`;
    return isValidISODate(candidate) ? candidate : `${y}-02-28`;
  };
  return inYear(year) >= today ? inYear(year) : inYear(year + 1);
}

export function describeDays(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** Each event with its day count: coming up soonest first, then past ones, most recent first. */
export function countdowns(events: readonly DayEvent[], today: string) {
  return events
    .map((event) => {
      const on = nextOccurrence(event, today);
      return { event, on, days: daysBetween(today, on) };
    })
    .sort((a, b) => (a.days >= 0 && b.days >= 0 ? a.days - b.days : b.days - a.days));
}
