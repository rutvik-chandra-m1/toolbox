import { addDays, parseISODate } from '@/shared/lib/dates';
import {
  RECALL_OFFSETS_DAYS,
  type Book,
  type Lesson,
  type PlanDay,
  type Progress,
  type RecallState,
  type Settings,
} from './types';

export const DEFAULT_SETTINGS: Settings = { id: 'main', time: '08:00', recallTime: '21:00', bookSlug: null };

export const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Local date + "HH:MM" -> a Date. */
export function atTime(date: string, time: string): Date {
  const day = parseISODate(date);
  if (!day || !isTime(time)) throw new Error(`Invalid date/time: ${date} ${time}`);
  day.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0);
  return day;
}

/** "08:00" -> "8:00 AM" (or 24-hour, as the device prefers). */
export function formatTime(time: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(atTime('2000-01-01', time));
}

export const lessonsOf = (books: readonly Book[]): Lesson[] => books.flatMap((b) => b.lessons);

/** The lessons the daily pick may use: one book, or (if it no longer exists) all of them. */
export function lessonsInScope(books: readonly Book[], bookSlug: string | null): Lesson[] {
  const chosen = bookSlug ? books.filter((b) => b.slug === bookSlug) : [];
  return lessonsOf(chosen.length > 0 ? chosen : books);
}

export type LessonStatus = 'unread' | 'opened' | 'read';

export function lessonStatus(progress: Progress | undefined): LessonStatus {
  if (progress?.completedAt) return 'read';
  return progress?.openedAt ? 'opened' : 'unread';
}

/**
 * Decides which lesson each of `dates` (in order) is for.
 *
 * Every day takes a random lesson from the unread pool (lessons whose cycle is not done); once
 * the pool is used up it refills with every lesson. A lesson from `existing` is kept while it is
 * still valid for its day, so re-planning does not reshuffle a plan that is still fine. A lesson
 * that was shown but not completed is still in the pool: it comes back at random, never forced.
 */
export function reconcilePlan(
  lessonIds: readonly string[],
  doneIds: ReadonlySet<string>,
  existing: ReadonlyMap<string, string>,
  dates: readonly string[],
  rng: () => number,
): Map<string, string> {
  const plan = new Map<string, string>();
  if (lessonIds.length === 0) return plan;
  const refill = () => new Set(lessonIds);
  let pool = new Set(lessonIds.filter((id) => !doneIds.has(id)));
  if (pool.size === 0) pool = refill();

  for (const date of dates) {
    const kept = existing.get(date);
    const pick = kept !== undefined && pool.has(kept) ? kept : [...pool][Math.floor(rng() * pool.size)];
    if (pick === undefined) continue;
    plan.set(date, pick);
    pool.delete(pick);
    if (pool.size === 0) pool = refill();
  }
  return plan;
}

/** Day a recall is next due, or null once all of them have been answered. */
export function recallDueDate(state: RecallState): string | null {
  const offset = RECALL_OFFSETS_DAYS[state.stage];
  return offset === undefined ? null : addDays(state.base, offset);
}

export function dueRecallStates(states: Iterable<RecallState>, date: string): RecallState[] {
  return [...states].filter((s) => {
    const due = recallDueDate(s);
    return due !== null && due <= date;
  });
}

/** How many recall questions are due on `date` (including ones overdue from earlier days). */
export function recallQuestionsDue(states: Iterable<RecallState>, lessonsById: ReadonlyMap<string, Lesson>, date: string): number {
  return dueRecallStates(states, date).reduce((sum, s) => sum + (lessonsById.get(s.id)?.recall.length ?? 0), 0);
}

/** First stage after a completed lesson that has no schedule yet. */
export const newRecallState = (lessonId: string, today: string): RecallState => ({ id: lessonId, base: today, stage: 0 });

/** The lesson read yesterday whose "try it today" has not been answered, if any. */
export function pickTryItCard(
  progress: Iterable<Progress>,
  lessonsById: ReadonlyMap<string, Lesson>,
  today: string,
  excludeId: string,
): Lesson | null {
  const yesterday = addDays(today, -1);
  const candidates = [...progress]
    .filter((p) => p.lastOpenedDate === yesterday && p.tryIt?.date !== yesterday && p.id !== excludeId)
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
  for (const p of candidates) {
    const lesson = lessonsById.get(p.id);
    if (lesson) return lesson;
  }
  return null;
}

/** Plan days up to and including `date` whose notification was for `lessonId`. */
export function plannedDatesFor(plan: Iterable<PlanDay>, lessonId: string, date: string): string[] {
  return [...plan].filter((p) => p.lessonId === lessonId && p.id <= date).map((p) => p.id);
}

/** Splits "a\nb" text into non-empty lines (the 30-second version is shown line by line). */
export const linesOf = (text: string) => text.split('\n').filter((line) => line.trim() !== '');
