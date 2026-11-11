import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'focus';
export const ROUTE = '/focus';

export const MODES = {
  focus: { label: 'Focus', minutes: 25, doneTitle: 'Focus session finished. Take a break.' },
  short: { label: 'Short break', minutes: 5, doneTitle: 'Break over. Back to it.' },
  long: { label: 'Long break', minutes: 15, doneTitle: 'Break over. Back to it.' },
} as const;
export type Mode = keyof typeof MODES;

/** The running timer: one record with id `current`, stored so it survives leaving the page. */
export interface Running extends Entity {
  mode: Mode;
  endAt: number;
}

/** A finished focus session. Its id is its end time, so recording it twice is harmless. */
export interface Session extends Entity {
  /** Local `YYYY-MM-DD`. */
  date: string;
  minutes: number;
}

/** Milliseconds as `MM:SS`, rounded up so the clock shows 00:00 only when it is really over. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function summarizeDay(sessions: readonly Session[], date: string) {
  const day = sessions.filter((s) => s.date === date);
  return { count: day.length, minutes: day.reduce((total, s) => total + s.minutes, 0) };
}
