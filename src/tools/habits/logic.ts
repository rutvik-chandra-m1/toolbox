import { addDays, parseISODate } from '@/shared/lib/dates';
import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'habits';

export interface Habit extends Entity {
  name: string;
  createdAt: number;
  /** Local `YYYY-MM-DD` days the habit was done. */
  done: string[];
}

export function toggleDay(done: readonly string[], day: string): string[] {
  return done.includes(day) ? done.filter((d) => d !== day) : [...done, day];
}

/** Consecutive days done, ending today, or yesterday so an unticked today does not zero the streak yet. */
export function streak(done: readonly string[], today: string): number {
  const days = new Set(done);
  let day = days.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (days.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}

/** The `count` days ending today, oldest first. */
export function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - count + 1));
}

export function weekdayLetter(day: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(parseISODate(day) ?? new Date());
}
