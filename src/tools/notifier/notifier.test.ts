import { describe, expect, it, vi } from 'vitest';
import type { NotificationService } from '@/shared/notifications';
import { createMemoryStorage } from '@/shared/storage';
import { combineDateTime, pastStatus, splitReminders, validateDraft } from './logic';
import { createReminderRepository } from './repository';
import type { Reminder } from './types';

const NOW = new Date(2030, 5, 15, 10, 0).getTime(); // 15 Jun 2030, 10:00 local
const draft = (message: string, date: string, time: string) => ({ message, date, time });

function reminder(id: string, at: number, extra: Partial<Reminder> = {}): Reminder {
  return { id, message: id, at, createdAt: 0, deliveredAt: null, ...extra };
}

describe('past-time validation', () => {
  it('accepts a time in the future and keeps the message exactly as typed', () => {
    const message = '  Ask teacher about AICTE points!  ';
    expect(validateDraft(draft(message, '2030-06-15', '10:01'), NOW)).toEqual({
      ok: true,
      message,
      at: new Date(2030, 5, 15, 10, 1).getTime(),
    });
  });

  it('rejects the current minute and anything earlier, with a clear message', () => {
    for (const [date, time] of [['2030-06-15', '10:00'], ['2030-06-15', '09:59'], ['2029-12-31', '23:00']] as const) {
      expect(validateDraft(draft('x', date, time), NOW)).toEqual({
        ok: false,
        error: 'That time has already passed. Pick a time in the future.',
      });
    }
  });

  it('rejects an empty message and missing or impossible dates/times', () => {
    expect(validateDraft(draft('   ', '2030-06-16', '10:00'), NOW)).toMatchObject({ ok: false, error: /message/ });
    expect(validateDraft(draft('x', '', '10:00'), NOW)).toMatchObject({ ok: false, error: /date and a time/ });
    expect(validateDraft(draft('x', '2030-06-16', ''), NOW)).toMatchObject({ ok: false });
    expect(combineDateTime('2030-02-30', '10:00')).toBeNull();
    expect(combineDateTime('2030-06-16', '24:00')).toBeNull();
  });
});

describe('sorting into Upcoming and Past', () => {
  it('splits at "now": upcoming soonest first, past most recent first', () => {
    const list = [
      reminder('later', NOW + 7200_000),
      reminder('long-ago', NOW - 7200_000),
      reminder('soon', NOW + 60_000),
      reminder('just-now', NOW), // due this instant counts as past
      reminder('recent', NOW - 60_000),
    ];
    const { upcoming, past } = splitReminders(list, NOW);
    expect(upcoming.map((r) => r.id)).toEqual(['soon', 'later']);
    expect(past.map((r) => r.id)).toEqual(['just-now', 'recent', 'long-ago']);
  });

  it('a past reminder is "Sent" on Android, and on a laptop only if it was shown', () => {
    expect(pastStatus(reminder('a', NOW - 1), true)).toBe('Sent');
    expect(pastStatus(reminder('a', NOW - 1), false)).toBe('Missed');
    expect(pastStatus(reminder('a', NOW - 1, { deliveredAt: NOW - 1 }), false)).toBe('Sent');
  });
});

function setup() {
  const calls: string[] = [];
  const notifications = {
    schedule: vi.fn(async (id: string, title: string) => void calls.push(`schedule ${id} ${title}`)),
    cancel: vi.fn(async (id: string) => void calls.push(`cancel ${id}`)),
  } as unknown as NotificationService & { schedule: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  const collection = createMemoryStorage().collection<Reminder>('notifier', 'reminders');
  let ids = 0;
  const repo = createReminderRepository(collection, notifications, { now: () => NOW, newId: () => `id${++ids}` });
  return { calls, notifications, collection, repo };
}

describe('reminder repository', () => {
  it('saving stores the reminder and schedules the exact message as the only text', async () => {
    const { repo, notifications, collection } = setup();
    const saved = await repo.add(draft('Ask teacher about AICTE points', '2030-06-15', '11:00'));

    const at = new Date(2030, 5, 15, 11, 0);
    expect(notifications.schedule).toHaveBeenCalledWith('id1', 'Ask teacher about AICTE points', '', at, {
      route: '/notifier',
    });
    expect(await collection.getAll()).toEqual([saved]);
  });

  it('a past time is refused: nothing stored, nothing scheduled', async () => {
    const { repo, notifications, collection } = setup();
    await expect(repo.add(draft('x', '2030-06-15', '09:00'))).rejects.toThrow('already passed');
    expect(notifications.schedule).not.toHaveBeenCalled();
    expect(await collection.getAll()).toEqual([]);
  });

  it('editing cancels the old notification, then schedules the new one', async () => {
    const { repo, calls, collection } = setup();
    const { id } = await repo.add(draft('old text', '2030-06-15', '11:00'));
    calls.length = 0;

    await repo.update(id, draft('new text', '2030-06-16', '08:30'));

    expect(calls).toEqual([`cancel ${id}`, `schedule ${id} new text`]);
    expect(await collection.get(id)).toMatchObject({ message: 'new text', at: new Date(2030, 5, 16, 8, 30).getTime() });
  });

  it('an edit to a past time is refused and leaves the old notification alone', async () => {
    const { repo, calls } = setup();
    const { id } = await repo.add(draft('keep', '2030-06-15', '11:00'));
    calls.length = 0;
    await expect(repo.update(id, draft('keep', '2020-01-01', '08:00'))).rejects.toThrow('already passed');
    expect(calls).toEqual([]);
  });

  it('deleting cancels the notification and removes the reminder', async () => {
    const { repo, notifications, collection } = setup();
    const { id } = await repo.add(draft('bye', '2030-06-15', '11:00'));

    await repo.remove(id);

    expect(notifications.cancel).toHaveBeenCalledWith(id);
    expect(await collection.getAll()).toEqual([]);
  });

  it('clearing past reminders keeps upcoming ones', async () => {
    const { repo, collection } = setup();
    await collection.put(reminder('past', NOW - 1));
    await collection.put(reminder('future', NOW + 1));

    expect(await repo.clearPast()).toBe(1);
    expect((await collection.getAll()).map((r) => r.id)).toEqual(['future']);
  });

  it('on app start, re-schedules only the reminders still to come', async () => {
    const { repo, calls, collection } = setup();
    await collection.put(reminder('past', NOW - 1));
    await collection.put(reminder('future', NOW + 60_000));

    expect(await repo.restore()).toBe(1);
    expect(calls).toEqual(['schedule future future']);
  });

  it('records when a reminder was shown', async () => {
    const { repo, collection } = setup();
    await collection.put(reminder('r', NOW - 1));
    await repo.markDelivered('r');
    expect((await collection.get('r'))?.deliveredAt).toBe(NOW);
  });
});
