import { describe, expect, it, vi } from 'vitest';
import type { NotificationEvent, NotificationService, ScheduleOptions } from '@/shared/notifications';
import { createMemoryStorage } from '@/shared/storage';
import { createRepository } from './repository';
import { clearShownLessonNotification, lessonKey, scheduleTestNotification, syncSchedule } from './scheduler';
import type { Book, Lesson } from './types';

const NOW = new Date(2030, 5, 15, 7, 0).getTime(); // 15 Jun 2030, 07:00 local; the daily time (08:00) is still ahead
const lesson = (id: string, recall = 2): Lesson => ({
  id,
  title: `Lesson ${id}`,
  hook: `Hook ${id}`,
  quick: 'a',
  original: 'o',
  explanation: 'e',
  realWorld: 'r',
  extraThoughts: 'x',
  tryToday: 't',
  recall: Array.from({ length: recall }, (_, i) => ({ q: `q${i}`, a: `a${i}` })),
});
const books: Book[] = [
  { slug: 'one', title: 'One', lessons: [lesson('a'), lesson('b'), lesson('c')] },
  { slug: 'two', title: 'Two', lessons: [lesson('x'), lesson('y')] },
];

interface Scheduled {
  id: string;
  title: string;
  body: string;
  at: Date;
  options: ScheduleOptions;
}

function setup(now = NOW) {
  const pending = new Map<string, Scheduled>();
  const events: NotificationEvent[] = [];
  const notifications: NotificationService = {
    platform: 'android',
    firesWhenClosed: true,
    checkPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    schedule: vi.fn(async (id: string, title: string, body: string, at: Date, options: ScheduleOptions = {}) => {
      pending.set(id, { id, title, body, at, options });
    }),
    cancel: vi.fn(async (id: string) => void pending.delete(id)),
    listPending: async () => [...pending.values()].map(({ id, title, body, at, options }) => ({ id, title, body, at, channelId: options.channel?.id })),
    canScheduleExact: async () => true,
    openExactAlarmSettings: async () => {},
    onDelivered: () => () => {},
    takeEvents: async () => events.splice(0),
  };
  const storage = createMemoryStorage();
  let clock = now;
  const repo = createRepository(storage, { now: () => clock });
  const deps = { repo, books, notifications, now: () => clock, rng: () => 0 };
  return {
    pending,
    events,
    notifications,
    repo,
    deps,
    sync: () => syncSchedule(deps),
    setNow: (t: number) => void (clock = t),
  };
}

const at = (day: number, h: number, m = 0) => new Date(2030, 5, day, h, m);

describe('the daily lesson notification', () => {
  it('is scheduled every day at the chosen time: lesson heading as title, hook as body', async () => {
    const { sync, pending } = setup();
    await sync();

    const today = pending.get(lessonKey('2030-06-15'));
    expect(today).toMatchObject({ title: 'Lesson a', body: 'Hook a', at: at(15, 8) });
    expect(pending.get(lessonKey('2030-06-16'))?.at).toEqual(at(16, 8));
    expect([...pending.keys()].filter((k) => k.startsWith('dailyread-lesson-'))).toHaveLength(60);
  });

  it('is ongoing, in its own channel with the book icon and accent, with the three buttons', async () => {
    const { sync, pending } = setup();
    await sync();

    const { options } = pending.get(lessonKey('2030-06-15'))!;
    expect(options).toMatchObject({
      route: '/daily-read/lesson/a',
      slot: 'dailyread-lesson',
      sticky: true,
      channel: {
        id: 'daily-read-chime',
        name: 'Daily Read',
        icon: 'ic_stat_book',
        color: '#d97706',
        logo: 'daily_read_logo', // its own logo instead of the app icon
        sound: 'daily_read_chime', // its own, clearly audible sound
        replaces: ['daily-read'], // the first channel (default sound) is removed
      },
    });
    expect(options.actions).toEqual([
      { id: 'read', title: 'Read now', kind: 'open' },
      { id: 'snooze', title: 'Snooze 1 hr', kind: 'snooze', minutes: 60 },
      { id: 'skip', title: 'Not today', kind: 'dismiss' },
    ]);
  });

  it('schedules again what an older version had put on its previous channel, even if text and time are the same', async () => {
    const { sync, pending } = setup();
    await sync();
    const key = lessonKey('2030-06-16');
    pending.set(key, { ...pending.get(key)!, options: { ...pending.get(key)!.options, channel: { id: 'daily-read', name: 'Daily Read' } } });
    await sync();
    expect(pending.get(key)?.options.channel?.id).toBe('daily-read-chime');
  });

  it('follows the time setting, and re-scheduling is a no-op when nothing changed', async () => {
    const { sync, pending, repo, notifications } = setup();
    await sync();
    const calls = vi.mocked(notifications.schedule).mock.calls.length;
    await sync();
    expect(vi.mocked(notifications.schedule).mock.calls.length).toBe(calls);

    await repo.saveSettings({ time: '19:30' });
    await sync();
    expect(pending.get(lessonKey('2030-06-15'))?.at).toEqual(at(15, 19, 30));
    expect(pending.get(lessonKey('2030-06-15'))?.title).toBe('Lesson a'); // same lesson, only the time moved
  });

  it('when today\'s time has already passed, today still gets a lesson (shown in the app) but no notification', async () => {
    const { sync, pending, repo, setNow } = setup();
    setNow(new Date(2030, 5, 15, 10, 0).getTime());
    await sync();
    expect(pending.has(lessonKey('2030-06-15'))).toBe(false);
    expect(pending.has(lessonKey('2030-06-16'))).toBe(true);
    expect((await repo.readAll()).plan.get('2030-06-15')?.lessonId).toBe('a');
  });

  it('uses all books mixed, or one book', async () => {
    const { sync, pending, repo } = setup();
    await repo.saveSettings({ bookSlug: 'two' });
    await sync();
    const titles = [...pending.values()].filter((p) => p.id.startsWith('dailyread-lesson-')).map((p) => p.title);
    expect(new Set(titles)).toEqual(new Set(['Lesson x', 'Lesson y']));
  });

  it('does not repeat a lesson within a cycle', async () => {
    const { sync, pending } = setup();
    await sync();
    const first3 = ['15', '16', '17'].map((d) => pending.get(lessonKey(`2030-06-${d}`))?.title);
    expect(new Set(first3).size).toBe(3);
  });
});

describe('what happens to the notification as lessons are used', () => {
  it('a lesson completed before its notification is replaced by another one', async () => {
    const { sync, pending, repo } = setup();
    await sync();
    expect(pending.get(lessonKey('2030-06-15'))?.title).toBe('Lesson a');

    await repo.complete('a', ['a', 'b', 'c', 'x', 'y']);
    await sync();
    expect(pending.get(lessonKey('2030-06-15'))?.title).not.toBe('Lesson a');
  });

  it('"Not today" marks the day and leaves the lesson unread, so it is still in the pool', async () => {
    const { sync, events, repo, setNow } = setup();
    await sync();
    setNow(new Date(2030, 5, 15, 8, 5).getTime()); // after the notification
    events.push({ type: 'dismissed', id: lessonKey('2030-06-15'), at: NOW });
    await sync();

    const { plan, progress } = await repo.readAll();
    expect(plan.get('2030-06-15')).toMatchObject({ lessonId: 'a', skipped: true });
    expect(progress.get('a')?.cycleDone ?? false).toBe(false);
  });

  it('a lesson not completed by the next day\'s time stays unread and can be picked again later', async () => {
    const { sync, repo, setNow } = setup();
    await sync();
    setNow(new Date(2030, 5, 16, 9, 0).getTime()); // next day, after its notification
    await sync();
    const { plan, progress } = await repo.readAll();
    expect(plan.get('2030-06-15')?.lessonId).toBe('a'); // history is kept
    expect(progress.get('a')).toBeUndefined(); // not marked read
    // ...and the days that are still ahead may use it again once the pool wraps (it is in the pool).
    expect([...plan.values()].filter((p) => p.lessonId === 'a').length).toBeGreaterThan(1);
  });

  it('reading a lesson removes its notification from the shade, but not one still waiting for its time', async () => {
    const { deps, notifications, sync, setNow } = setup();
    await sync();
    setNow(new Date(2030, 5, 15, 8, 30).getTime());
    await clearShownLessonNotification(deps, 'a');
    expect(notifications.cancel).toHaveBeenCalledWith(lessonKey('2030-06-15'));
    expect(notifications.cancel).not.toHaveBeenCalledWith(lessonKey('2030-06-16'));
  });
});

describe('recall notifications', () => {
  it('post one swipeable notification at the recall time when anything is due, counting questions', async () => {
    const { sync, pending, repo } = setup();
    // Lessons "a" and "b" (2 questions each) are completed today.
    await repo.complete('a', ['a', 'b', 'c', 'x', 'y']);
    await repo.complete('b', ['a', 'b', 'c', 'x', 'y']);
    await sync();

    // Completed "today" (15th), so +3 days = 18th, +7 = 22nd.
    expect(pending.has('dailyread-recall-2030-06-17')).toBe(false);
    const day18 = pending.get('dailyread-recall-2030-06-18');
    expect(day18).toMatchObject({ title: '4 quick recalls', at: at(18, 21) });
    expect(day18?.options).toMatchObject({ route: '/daily-read/recall', slot: 'dailyread-recall' });
    expect(day18?.options.sticky).toBeUndefined(); // a normal notification: swipe clears it
    expect(day18?.options.actions).toBeUndefined();
    expect(day18?.options.channel).toMatchObject({ id: 'daily-read-chime', icon: 'ic_stat_book', logo: 'daily_read_logo' }); // same channel, icon and logo
    // Still unanswered later, so it keeps coming (overdue recalls stay due).
    expect(pending.get('dailyread-recall-2030-06-19')?.title).toBe('4 quick recalls');
  });

  it('uses the recall time setting', async () => {
    const { sync, pending, repo } = setup();
    await repo.saveSettings({ recallTime: '18:15' });
    await repo.complete('a', ['a', 'b', 'c', 'x', 'y']);
    await sync();
    expect(pending.get('dailyread-recall-2030-06-18')?.at).toEqual(at(18, 18, 15));
    expect(pending.get('dailyread-recall-2030-06-18')?.title).toBe('2 quick recalls');
  });

  it('are cancelled once answered, so nothing is posted when nothing is due', async () => {
    const { sync, pending, repo } = setup();
    await repo.complete('a', ['a', 'b', 'c', 'x', 'y']);
    await sync();
    expect(pending.has('dailyread-recall-2030-06-18')).toBe(true);

    await repo.answerRecall('a', true); // moves on to +7 days
    await sync();
    expect(pending.has('dailyread-recall-2030-06-18')).toBe(false);
    expect(pending.has('dailyread-recall-2030-06-22')).toBe(true);
  });
});

describe('the test button', () => {
  it('schedules today\'s kind of notification a minute from now, and is not removed by a sync', async () => {
    const { sync, pending, notifications } = setup();
    await scheduleTestNotification(notifications, lesson('a'), NOW);
    await sync();
    expect(pending.get('dailyread-test')).toMatchObject({ title: 'Lesson a', at: new Date(NOW + 60_000) });
    expect(pending.get('dailyread-test')?.options.sticky).toBe(true);
  });
});
