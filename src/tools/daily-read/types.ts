import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'daily-read';
export const ROUTE = '/daily-read';

/** A lesson is reviewed this many days after it was completed (a "Forgot" starts over from the first). */
export const RECALL_OFFSETS_DAYS: readonly number[] = [3, 7, 30];
/** How many days ahead notifications are scheduled; the plan is refreshed every time the app opens. */
export const PLAN_DAYS = 60;
export const SNOOZE_MINUTES = 60;

export const lessonRoute = (lessonId: string) => `${ROUTE}/lesson/${lessonId}`;
export const RECALL_ROUTE = `${ROUTE}/recall`;

export interface RecallQuestion {
  q: string;
  a: string;
}

export interface Lesson {
  id: string;
  title: string;
  hook: string;
  quick: string;
  /** The book's own words, never edited. */
  original: string;
  explanation: string;
  realWorld: string;
  extraThoughts: string;
  tryToday: string;
  recall: RecallQuestion[];
}

export interface Book {
  slug: string;
  title: string;
  lessons: Lesson[];
}

/** Single record (id "main"). `bookSlug` null = all books mixed. Times are local "HH:MM". */
export interface Settings extends Entity {
  id: 'main';
  time: string;
  recallTime: string;
  bookSlug: string | null;
}

/** One record per lesson that was ever opened or completed (id = lesson id). */
export interface Progress extends Entity {
  id: string;
  openedAt: number | null;
  /** Local day the lesson was last opened; the "did you try it?" card is built from it. */
  lastOpenedDate: string | null;
  completedAt: number | null;
  completedDate: string | null;
  /** True while the lesson is out of the unread pool; all cleared when the pool is used up. */
  cycleDone: boolean;
  tryIt: { date: string; answer: 'yes' | 'not-yet' } | null;
}

/** Which lesson a day's notification is for (id = local day `YYYY-MM-DD`). */
export interface PlanDay extends Entity {
  id: string;
  lessonId: string;
  /** "Not today" was pressed on that day's notification. */
  skipped: boolean;
}

/** Where a lesson is in its recall schedule: next due `RECALL_OFFSETS_DAYS[stage]` days after `base`. */
export interface RecallState extends Entity {
  id: string;
  base: string;
  stage: number;
}
