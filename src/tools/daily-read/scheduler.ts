import { addDays, todayISO } from '@/shared/lib/dates';
import type { NotificationChannel, NotificationService, ScheduleOptions } from '@/shared/notifications';
import { atTime, lessonsInScope, lessonsOf, plannedDatesFor, reconcilePlan, recallQuestionsDue } from './logic';
import type { Repository } from './repository';
import { PLAN_DAYS, RECALL_ROUTE, SNOOZE_MINUTES, lessonRoute, type Book, type Lesson } from './types';

/** Daily Read's own channel, status-bar icon (res/drawable/ic_stat_book.xml) and accent colour (amber-600). */
const CHANNEL: NotificationChannel = { id: 'daily-read', name: 'Daily Read', icon: 'ic_stat_book', color: '#d97706' };
const LESSON_SLOT = 'dailyread-lesson';
const RECALL_SLOT = 'dailyread-recall';

export const lessonKey = (date: string) => `${LESSON_SLOT}-${date}`;
const recallKey = (date: string) => `${RECALL_SLOT}-${date}`;
const TEST_KEY = 'dailyread-test';
/** The notifications this tool schedules per day; the test one is deliberately not matched. */
const PLANNED_KEY = /^dailyread-(lesson|recall)-\d{4}-\d{2}-\d{2}$/;
const LESSON_DAY = new RegExp(`^${LESSON_SLOT}-(\\d{4}-\\d{2}-\\d{2})$`);

/** Ongoing: swiping it re-posts it, and only these buttons (or reading the lesson) clear it. */
const lessonOptions = (lesson: Lesson): ScheduleOptions => ({
  route: lessonRoute(lesson.id),
  channel: CHANNEL,
  slot: LESSON_SLOT,
  sticky: true,
  actions: [
    { id: 'read', title: 'Read now', kind: 'open' },
    { id: 'snooze', title: 'Snooze 1 hr', kind: 'snooze', minutes: SNOOZE_MINUTES },
    { id: 'skip', title: 'Not today', kind: 'dismiss' },
  ],
});

/** A normal, swipeable notification. */
const recallOptions: ScheduleOptions = { route: RECALL_ROUTE, channel: CHANNEL, slot: RECALL_SLOT };

const recallTitle = (count: number) => `${count} quick ${count === 1 ? 'recall' : 'recalls'}`;

interface Wanted {
  title: string;
  body: string;
  at: Date;
  options: ScheduleOptions;
}

export interface SyncDeps {
  repo: Repository;
  books: readonly Book[];
  notifications: NotificationService;
  now?: () => number;
  rng?: () => number;
}

async function run({ repo, books, notifications, now = Date.now, rng = Math.random }: SyncDeps): Promise<void> {
  // 1. What the notification buttons did while the app was closed.
  for (const event of await notifications.takeEvents()) {
    const day = LESSON_DAY.exec(event.id)?.[1];
    if (event.type === 'dismissed' && day) await repo.skip(day); // the lesson simply stays in the unread pool
  }

  // 2. Which lesson each coming day is for. Days whose time has passed keep what they had.
  const { settings, progress, plan, recalls } = await repo.readAll();
  const lessons = lessonsInScope(books, settings.bookSlug);
  const today = todayISO(new Date(now()));
  const dates = Array.from({ length: PLAN_DAYS }, (_, i) => addDays(today, i));
  const upcoming = (date: string, time: string) => atTime(date, time).getTime() > now();
  const toAssign = dates.filter((d) => upcoming(d, settings.time) || (d === today && !plan.has(d)));
  const doneIds = new Set([...progress.values()].filter((p) => p.cycleDone).map((p) => p.id));
  const existing = new Map([...plan.values()].map((p) => [p.id, p.lessonId]));
  const assigned = reconcilePlan(
    lessons.map((l) => l.id),
    doneIds,
    existing,
    toAssign,
    rng,
  );
  await repo.savePlan(assigned, toAssign, plan);

  // 3. The notifications that should exist: one lesson a day, and a recall count on days anything is due.
  const lessonsById = new Map(lessonsOf(books).map((l) => [l.id, l]));
  const wanted = new Map<string, Wanted>();
  for (const date of dates) {
    const day = assigned.get(date) ?? plan.get(date)?.lessonId;
    const lesson = day ? lessonsById.get(day) : undefined;
    if (lesson && upcoming(date, settings.time)) {
      wanted.set(lessonKey(date), { title: lesson.title, body: lesson.hook, at: atTime(date, settings.time), options: lessonOptions(lesson) });
    }
    const due = recallQuestionsDue(recalls.values(), lessonsById, date);
    if (due > 0 && upcoming(date, settings.recallTime)) {
      wanted.set(recallKey(date), {
        title: recallTitle(due),
        body: 'Tap to test what you remember.',
        at: atTime(date, settings.recallTime),
        options: recallOptions,
      });
    }
  }

  // 4. Bring the scheduled notifications in line, touching only what changed.
  const pending = new Map((await notifications.listPending()).filter((p) => PLANNED_KEY.test(p.id)).map((p) => [p.id, p]));
  for (const id of pending.keys()) if (!wanted.has(id)) await notifications.cancel(id);
  for (const [id, w] of wanted) {
    const have = pending.get(id);
    if (have && have.title === w.title && have.body === w.body && have.at?.getTime() === w.at.getTime()) continue;
    await notifications.schedule(id, w.title, w.body, w.at, w.options);
  }
}

let queue: Promise<void> = Promise.resolve();

/**
 * Brings the stored plan and the scheduled notifications up to date with the current state (settings,
 * what has been read, what is due). Safe to call whenever anything changed; calls run one after another.
 */
export function syncSchedule(deps: SyncDeps): Promise<void> {
  const result = queue.then(() => run(deps));
  queue = result.catch(() => {}); // a failed sync must not block the next one
  return result;
}

/** Removes the lesson notification from the shade once its lesson is read (or opened). Already-pending ones are left alone. */
export async function clearShownLessonNotification(deps: SyncDeps, lessonId: string): Promise<void> {
  const { settings, plan } = await deps.repo.readAll();
  const now = (deps.now ?? Date.now)();
  const today = todayISO(new Date(now));
  for (const date of plannedDatesFor(plan.values(), lessonId, today)) {
    if (atTime(date, settings.time).getTime() <= now) await deps.notifications.cancel(lessonKey(date));
  }
}

/** For the Test button: today's lesson notification, a minute from now. */
export async function scheduleTestNotification(notifications: NotificationService, lesson: Lesson, now = Date.now()) {
  await notifications.schedule(TEST_KEY, lesson.title, lesson.hook, new Date(now + 60_000), lessonOptions(lesson));
}
