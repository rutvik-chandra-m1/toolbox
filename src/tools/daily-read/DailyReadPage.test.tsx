import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, todayISO } from '@/shared/lib/dates';
import { StorageProvider, createMemoryStorage } from '@/shared/storage';
import DailyReadPage from './DailyReadPage';
import type { PlanDay, Progress, RecallState, Settings } from './types';

// A fixed catalogue, so the tests do not depend on the sample or on books added later.
vi.mock('./content', () => {
  const lesson = (id: string) => ({
    id,
    title: `Lesson ${id}`,
    hook: `Hook ${id}`,
    quick: `Quick one ${id}\nQuick two ${id}`,
    original: `The exact words of ${id}.\n\nSecond paragraph of ${id}.`,
    explanation: `Explanation of ${id}`,
    realWorld: `Real world of ${id}`,
    extraThoughts: `Extra thoughts of ${id}`,
    tryToday: `try ${id} today`,
    recall: [
      { q: `Question one of ${id}?`, a: `Answer one of ${id}` },
      { q: `Question two of ${id}?`, a: `Answer two of ${id}` },
    ],
  });
  return { catalog: [{ slug: 'one', title: 'Book One', lessons: [lesson('a'), lesson('b')] }], usingSample: false };
});

const today = todayISO();
const yesterday = addDays(today, -1);
const progress = (id: string, extra: Partial<Progress> = {}): Progress => ({
  id,
  openedAt: null,
  lastOpenedDate: null,
  completedAt: null,
  completedDate: null,
  cycleDone: false,
  tryIt: null,
  ...extra,
});

function renderAt(path: string) {
  const storage = createMemoryStorage();
  const view = () =>
    render(
      <StorageProvider backend={storage}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/daily-read/*" element={<DailyReadPage />} />
          </Routes>
        </MemoryRouter>
      </StorageProvider>,
    );
  return { storage, view, c: <T extends { id: string }>(name: string) => storage.collection<T>('daily-read', name) };
}

/** jsdom has no layout: the end-of-lesson marker is "reached" when the test says so. */
const observers = new Set<(entries: Array<{ isIntersecting: boolean }>) => void>();
beforeEach(() => {
  observers.clear();
  class FakeObserver {
    private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void;
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      this.callback = callback;
    }
    observe() {
      observers.add(this.callback);
    }
    disconnect() {
      observers.delete(this.callback);
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});
afterEach(() => vi.unstubAllGlobals());
const scrollToEnd = () => act(async () => void [...observers].forEach((cb) => cb([{ isIntersecting: true }])));

describe('home', () => {
  it('shows today\'s lesson with its hook and status', async () => {
    const t = renderAt('/daily-read');
    await t.c<PlanDay>('plan').put({ id: today, lessonId: 'a', skipped: false });
    t.view();

    expect(await screen.findByText('Lesson a')).toBeTruthy();
    expect(screen.getByText('Hook a')).toBeTruthy();
    expect(screen.getByText('Unread')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Read now/ }).getAttribute('href')).toBe('/daily-read/lesson/a');
    expect(screen.getByRole('link', { name: /Library/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Settings/ })).toBeTruthy();
  });

  it('shows "Completed today" once the lesson is done', async () => {
    const t = renderAt('/daily-read');
    await t.c<PlanDay>('plan').put({ id: today, lessonId: 'a', skipped: false });
    await t.c<Progress>('progress').put(progress('a', { openedAt: 1, completedAt: 2, completedDate: today, cycleDone: true }));
    t.view();
    expect(await screen.findByText('Completed today')).toBeTruthy();
  });

  it('offers the quick recalls that are due', async () => {
    const t = renderAt('/daily-read');
    await t.c<RecallState>('recalls').put({ id: 'a', base: addDays(today, -3), stage: 0 });
    t.view();
    expect(await screen.findByText('2 quick recalls due')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Start recalls/ }).getAttribute('href')).toBe('/daily-read/recall');
  });
});

describe('lesson screen', () => {
  it('shows the parts in order, with the book\'s own words quoted exactly', async () => {
    renderAt('/daily-read/lesson/a').view();
    await screen.findByRole('heading', { level: 2, name: 'Lesson a' });

    expect(screen.getByText('Book One')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim())).toEqual([
      'The 30-second version',
      'Original text',
      'Explanation',
      'Real-world implications',
      'Extra thoughts',
      'Try it today',
      'Status',
    ]);
    expect(document.querySelector('blockquote')?.textContent).toBe('The exact words of a.\n\nSecond paragraph of a.');
    expect(screen.getByText('Quick one a')).toBeTruthy();
    expect(screen.getByText('try a today')).toBeTruthy();
  });

  it('opening marks it Opened; scrolling to the end completes it and starts the recall schedule', async () => {
    const t = renderAt('/daily-read/lesson/a');
    t.view();
    await screen.findByRole('heading', { level: 2, name: 'Lesson a' });

    await waitFor(async () => expect((await t.c<Progress>('progress').get('a'))?.openedAt).toBeTruthy());
    expect((await t.c<Progress>('progress').get('a'))?.completedAt).toBeNull();
    expect(await t.c<RecallState>('recalls').get('a')).toBeUndefined();

    await scrollToEnd();
    await waitFor(() => expect(within(screen.getByText('Status').parentElement!).getByText('Completed today')).toBeTruthy());
    expect(await t.c<Progress>('progress').get('a')).toMatchObject({ completedDate: today, cycleDone: true });
    expect(await t.c<RecallState>('recalls').get('a')).toEqual({ id: 'a', base: today, stage: 0 });
  });

  it('asks about yesterday\'s "try it today" on today\'s lesson, and saves the answer', async () => {
    const t = renderAt('/daily-read/lesson/b');
    await t.c<PlanDay>('plan').put({ id: today, lessonId: 'b', skipped: false });
    await t.c<Progress>('progress').put(progress('a', { openedAt: 5, lastOpenedDate: yesterday }));
    t.view();

    expect(await screen.findByText(/Did you try yesterday's: try a today\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }));

    await waitFor(async () => expect((await t.c<Progress>('progress').get('a'))?.tryIt).toEqual({ date: yesterday, answer: 'not-yet' }));
    expect(screen.queryByText(/Did you try yesterday's/)).toBeNull();
  });

  it('does not ask on a lesson that is not today\'s', async () => {
    const t = renderAt('/daily-read/lesson/b');
    await t.c<PlanDay>('plan').put({ id: today, lessonId: 'a', skipped: false }); // today's lesson is "a"
    await t.c<Progress>('progress').put(progress('a', { openedAt: 5, lastOpenedDate: yesterday }));
    t.view();
    await screen.findByRole('heading', { level: 2, name: 'Lesson b' });
    expect(screen.queryByText(/Did you try yesterday's/)).toBeNull();
  });

  it('says so for a lesson that does not exist', async () => {
    renderAt('/daily-read/lesson/zzz').view();
    expect(await screen.findByText('Lesson not found')).toBeTruthy();
  });
});

describe('recall screen', () => {
  async function dueRecall() {
    const t = renderAt('/daily-read/recall');
    await t.c<RecallState>('recalls').put({ id: 'a', base: addDays(today, -3), stage: 0 });
    t.view();
    await screen.findByText(/Question 1 of 2/);
    return t;
  }

  it('shows the question, reveals the answer on tap, and moves on with Got it', async () => {
    const t = await dueRecall();
    expect(screen.getByText('Question one of a?')).toBeTruthy();
    expect(screen.queryByText('Answer one of a')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('Answer one of a')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await screen.findByText(/Question 2 of 2/);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await screen.findByText('All done');
    await waitFor(async () => expect((await t.c<RecallState>('recalls').get('a'))?.stage).toBe(1)); // next review: +7 days
  });

  it('Forgot restarts that lesson\'s schedule from +3 days', async () => {
    const t = await dueRecall();
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forgot' }));
    await screen.findByText(/Question 2 of 2/);
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await screen.findByText('All done');
    await waitFor(async () => expect(await t.c<RecallState>('recalls').get('a')).toEqual({ id: 'a', base: today, stage: 0 }));
  });

  it('has nothing to show when nothing is due', async () => {
    renderAt('/daily-read/recall').view();
    expect(await screen.findByText('Nothing to recall right now')).toBeTruthy();
  });
});

describe('library', () => {
  it('lists books, then a book\'s lessons with Unread / Read-on status', async () => {
    const t = renderAt('/daily-read/library');
    await t.c<Progress>('progress').put(progress('a', { openedAt: 1, completedAt: 2, completedDate: addDays(today, -4), cycleDone: true }));
    t.view();

    expect(await screen.findByText('1 of 2 lessons read')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: /Book One/ }));

    expect(await screen.findByText(/1\. Lesson a/)).toBeTruthy();
    expect(screen.getByText(/Read on/)).toBeTruthy();
    expect(screen.getByText('Unread')).toBeTruthy();
    expect(screen.getByRole('link', { name: /2\. Lesson b/ }).getAttribute('href')).toBe('/daily-read/lesson/b');
  });
});

describe('settings', () => {
  it('saves the daily time, recall time and the book to use', async () => {
    const t = renderAt('/daily-read/settings');
    t.view();
    const dailyTime = await screen.findByLabelText('Daily lesson time');
    expect((dailyTime as HTMLInputElement).value).toBe('08:00'); // the default
    expect((screen.getByLabelText('Recall time') as HTMLInputElement).value).toBe('21:00');

    fireEvent.change(dailyTime, { target: { value: '06:30' } });
    fireEvent.change(screen.getByLabelText('Recall time'), { target: { value: '20:15' } });
    fireEvent.click(screen.getByLabelText('One book'));
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await screen.findByText(/Saved\./);
    expect(await t.c<Settings>('settings').get('main')).toEqual({ id: 'main', time: '06:30', recallTime: '20:15', bookSlug: 'one' });
  });

  it('refuses an empty time', async () => {
    const t = renderAt('/daily-read/settings');
    t.view();
    fireEvent.change(await screen.findByLabelText('Daily lesson time'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(await t.c<Settings>('settings').get('main')).toBeUndefined();
  });
});
