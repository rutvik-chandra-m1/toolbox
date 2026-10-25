import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/shared/storage';
import { DEFAULT_SETTINGS } from './logic';
import { createRepository } from './repository';

const NOW = new Date(2030, 5, 15, 10, 0).getTime();
const SCOPE = ['a', 'b', 'c'];

function setup() {
  let clock = NOW;
  const repo = createRepository(createMemoryStorage(), { now: () => clock });
  return { repo, setNow: (t: number) => void (clock = t) };
}

describe('settings', () => {
  it('default to 8:00 AM for the lesson, 9:00 PM for recalls, all books', async () => {
    const { repo } = setup();
    expect((await repo.readAll()).settings).toEqual({ id: 'main', time: '08:00', recallTime: '21:00', bookSlug: null });
    expect(DEFAULT_SETTINGS.time).toBe('08:00');
  });

  it('are saved and changed one field at a time', async () => {
    const { repo } = setup();
    await repo.saveSettings({ time: '06:45' });
    await repo.saveSettings({ bookSlug: 'one' });
    expect((await repo.readAll()).settings).toMatchObject({ time: '06:45', recallTime: '21:00', bookSlug: 'one' });
  });
});

describe('opening and completing', () => {
  it('opening marks a lesson Opened (not completed) and remembers the day', async () => {
    const { repo } = setup();
    await repo.open('a');
    expect((await repo.readAll()).progress.get('a')).toMatchObject({
      openedAt: NOW,
      lastOpenedDate: '2030-06-15',
      completedAt: null,
      cycleDone: false,
    });
  });

  it('opening again keeps the first time', async () => {
    const { repo, setNow } = setup();
    await repo.open('a');
    setNow(NOW + 86_400_000);
    await repo.open('a');
    expect((await repo.readAll()).progress.get('a')).toMatchObject({ openedAt: NOW, lastOpenedDate: '2030-06-16' });
  });

  it('completing takes the lesson out of the pool and starts its recall schedule at +3 days', async () => {
    const { repo } = setup();
    await repo.complete('a', SCOPE);
    const { progress, recalls } = await repo.readAll();
    expect(progress.get('a')).toMatchObject({ completedAt: NOW, completedDate: '2030-06-15', cycleDone: true, openedAt: NOW });
    expect(recalls.get('a')).toEqual({ id: 'a', base: '2030-06-15', stage: 0 });
  });

  it('completing from the library works the same way, and rereading does not restart the recall schedule', async () => {
    const { repo, setNow } = setup();
    await repo.complete('a', SCOPE);
    await repo.answerRecall('a', true); // stage 1
    setNow(NOW + 5 * 86_400_000);
    await repo.complete('a', SCOPE);
    const { recalls, progress } = await repo.readAll();
    expect(recalls.get('a')).toMatchObject({ base: '2030-06-15', stage: 1 });
    expect(progress.get('a')?.completedDate).toBe('2030-06-20');
  });

  it('when the last lesson of the pool is completed the pool resets, but "read" stays read', async () => {
    const { repo } = setup();
    await repo.complete('a', SCOPE);
    await repo.complete('b', SCOPE);
    expect([...(await repo.readAll()).progress.values()].map((p) => p.cycleDone)).toEqual([true, true]);

    await repo.complete('c', SCOPE);
    const { progress } = await repo.readAll();
    expect([...progress.values()].map((p) => p.cycleDone)).toEqual([false, false, false]);
    expect([...progress.values()].every((p) => p.completedAt !== null)).toBe(true);
  });
});

describe('recall answers', () => {
  it('"Got it" moves to the next review; after the third the schedule is finished', async () => {
    const { repo } = setup();
    await repo.complete('a', SCOPE);
    for (const stage of [1, 2, 3]) {
      await repo.answerRecall('a', true);
      expect((await repo.readAll()).recalls.get('a')?.stage).toBe(stage);
    }
  });

  it('"Forgot" restarts that lesson\'s schedule from +3 days, counted from today', async () => {
    const { repo, setNow } = setup();
    await repo.complete('a', SCOPE);
    await repo.answerRecall('a', true);
    setNow(NOW + 9 * 86_400_000);
    await repo.answerRecall('a', false);
    expect((await repo.readAll()).recalls.get('a')).toEqual({ id: 'a', base: '2030-06-24', stage: 0 });
  });

  it('ignores a lesson with no schedule', async () => {
    const { repo } = setup();
    await repo.answerRecall('nope', true);
    expect((await repo.readAll()).recalls.size).toBe(0);
  });
});

describe('try-it answers and skipped days', () => {
  it('saves the answer for the day', async () => {
    const { repo } = setup();
    await repo.answerTryIt('a', '2030-06-14', 'not-yet');
    expect((await repo.readAll()).progress.get('a')?.tryIt).toEqual({ date: '2030-06-14', answer: 'not-yet' });
  });

  it('"Not today" marks only that day', async () => {
    const { repo } = setup();
    await repo.savePlan(new Map([['2030-06-15', 'a'], ['2030-06-16', 'b']]), ['2030-06-15', '2030-06-16'], new Map());
    await repo.skip('2030-06-15');
    const { plan } = await repo.readAll();
    expect(plan.get('2030-06-15')?.skipped).toBe(true);
    expect(plan.get('2030-06-16')?.skipped).toBe(false);
  });
});
