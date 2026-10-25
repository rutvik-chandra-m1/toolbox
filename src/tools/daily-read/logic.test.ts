import { describe, expect, it } from 'vitest';
import { loadBooks, parseBook } from './content';
import {
  atTime,
  dueRecallStates,
  formatTime,
  isTime,
  lessonStatus,
  lessonsInScope,
  pickTryItCard,
  recallDueDate,
  recallQuestionsDue,
  reconcilePlan,
} from './logic';
import type { Book, Lesson, Progress, RecallState } from './types';

function lesson(id: string, questions = 2): Lesson {
  return {
    id,
    title: `Title ${id}`,
    hook: `Hook ${id}`,
    quick: 'a\nb',
    original: `Original ${id}`,
    explanation: 'e',
    realWorld: 'r',
    extraThoughts: 'x',
    tryToday: `Do ${id}`,
    recall: Array.from({ length: questions }, (_, i) => ({ q: `q${i}`, a: `a${i}` })),
  };
}
const book = (slug: string, ids: string[]): Book => ({ slug, title: slug.toUpperCase(), lessons: ids.map((id) => lesson(id)) });
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
/** Deterministic "random": always the first candidate. */
const first = () => 0;
/** A repeatable pseudo-random sequence. */
function seeded(seed: number) {
  // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const days = (n: number) => Array.from({ length: n }, (_, i) => `2030-06-${String(10 + i).padStart(2, '0')}`);

describe('picking the daily lesson', () => {
  it('uses every lesson once before any repeats, then the pool refills', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const plan = reconcilePlan(ids, new Set(), new Map(), days(8), seeded(7));
    const picks = days(8).map((d) => plan.get(d));
    expect(new Set(picks.slice(0, 4))).toEqual(new Set(ids)); // first cycle: all four, no repeat
    expect(new Set(picks.slice(4, 8))).toEqual(new Set(ids)); // pool reset: all four again
  });

  it('draws only from the unread pool', () => {
    const plan = reconcilePlan(['a', 'b', 'c'], new Set(['a', 'b']), new Map(), days(1), seeded(1));
    expect(plan.get(days(1)[0]!)).toBe('c');
  });

  it('refills straight away when everything is done', () => {
    const plan = reconcilePlan(['a', 'b'], new Set(['a', 'b']), new Map(), days(1), first);
    expect(plan.get(days(1)[0]!)).toBe('a');
  });

  it('keeps a day that is still valid, so re-planning does not reshuffle', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const [d1, d2, d3] = days(3) as [string, string, string];
    const existing = new Map([[d1, 'c'], [d2, 'a']]);
    const plan = reconcilePlan(ids, new Set(), existing, [d1, d2, d3], seeded(3));
    expect(plan.get(d1)).toBe('c');
    expect(plan.get(d2)).toBe('a');
    expect(['b', 'd']).toContain(plan.get(d3));
  });

  it('replaces a planned lesson that was completed in the meantime', () => {
    const [d1, d2] = days(2) as [string, string];
    const plan = reconcilePlan(['a', 'b', 'c'], new Set(['a']), new Map([[d1, 'a']]), [d1, d2], first);
    expect(plan.get(d1)).not.toBe('a');
    expect(plan.get(d2)).not.toBe('a');
  });

  it('a shown but uncompleted lesson stays in the pool: it can come back, at random, and is never forced', () => {
    // "a" was yesterday's lesson and was not completed. Nothing is done, so all three are candidates again.
    const [d1] = days(1) as [string];
    const seen = new Set<string | undefined>();
    for (let seed = 1; seed <= 40; seed++) seen.add(reconcilePlan(['a', 'b', 'c'], new Set(), new Map(), [d1], seeded(seed)).get(d1));
    expect(seen).toEqual(new Set(['a', 'b', 'c']));
  });

  it('plans nothing without lessons', () => {
    expect(reconcilePlan([], new Set(), new Map(), days(3), first).size).toBe(0);
  });
});

describe('books in use', () => {
  const books = [book('x', ['x1', 'x2']), book('y', ['y1'])];
  it('mixes all books, or uses one; an unknown book falls back to all', () => {
    expect(lessonsInScope(books, null).map((l) => l.id)).toEqual(['x1', 'x2', 'y1']);
    expect(lessonsInScope(books, 'y').map((l) => l.id)).toEqual(['y1']);
    expect(lessonsInScope(books, 'gone').map((l) => l.id)).toEqual(['x1', 'x2', 'y1']);
  });
});

describe('times', () => {
  it('validates HH:MM and builds local dates', () => {
    expect(isTime('08:00')).toBe(true);
    expect(isTime('23:59')).toBe(true);
    for (const bad of ['', '8:00', '24:00', '12:60', 'ab:cd']) expect(isTime(bad)).toBe(false);
    expect(atTime('2030-06-15', '21:30')).toEqual(new Date(2030, 5, 15, 21, 30));
    expect(() => atTime('2030-06-15', '25:00')).toThrow();
    expect(formatTime('08:00')).toMatch(/8:00/);
  });
});

describe('recall schedule', () => {
  const state = (stage: number, base = '2030-06-10'): RecallState => ({ id: 'a', base, stage });

  it('is due 3, 7 and 30 days after completion, then finished', () => {
    expect([0, 1, 2].map((s) => recallDueDate(state(s)))).toEqual(['2030-06-13', '2030-06-17', '2030-07-10']);
    expect(recallDueDate(state(3))).toBeNull();
  });

  it('counts due questions, including overdue ones, and nothing before the due day', () => {
    const lessonsById = new Map([lesson('a', 3), lesson('b', 2)].map((l) => [l.id, l]));
    const states = [state(0), { id: 'b', base: '2030-06-12', stage: 0 }];
    expect(recallQuestionsDue(states, lessonsById, '2030-06-12')).toBe(0);
    expect(recallQuestionsDue(states, lessonsById, '2030-06-13')).toBe(3);
    expect(recallQuestionsDue(states, lessonsById, '2030-06-20')).toBe(5); // a is overdue, b is due
    expect(dueRecallStates(states, '2030-06-13').map((s) => s.id)).toEqual(['a']);
  });
});

describe('"did you try yesterday\'s" card', () => {
  const lessonsById = new Map([lesson('a'), lesson('b')].map((l) => [l.id, l]));
  const today = '2030-06-15';

  it('offers the lesson opened yesterday until it is answered', () => {
    const opened = progress('a', { openedAt: 1, lastOpenedDate: '2030-06-14' });
    expect(pickTryItCard([opened], lessonsById, today, 'b')?.id).toBe('a');
    const answered = { ...opened, tryIt: { date: '2030-06-14', answer: 'yes' as const } };
    expect(pickTryItCard([answered], lessonsById, today, 'b')).toBeNull();
  });

  it('ignores older lessons, today\'s own lesson and unknown ones', () => {
    expect(pickTryItCard([progress('a', { lastOpenedDate: '2030-06-13' })], lessonsById, today, 'b')).toBeNull();
    expect(pickTryItCard([progress('a', { lastOpenedDate: '2030-06-14' })], lessonsById, today, 'a')).toBeNull();
    expect(pickTryItCard([progress('zz', { lastOpenedDate: '2030-06-14' })], lessonsById, today, 'b')).toBeNull();
  });
});

describe('reading status', () => {
  it('is unread, opened or read', () => {
    expect(lessonStatus(undefined)).toBe('unread');
    expect(lessonStatus(progress('a', { openedAt: 5 }))).toBe('opened');
    expect(lessonStatus(progress('a', { openedAt: 5, completedAt: 9 }))).toBe('read');
  });
});

describe('loading books', () => {
  const raw = (id: string) => ({ ...lesson(id) });
  const file = (slug: string, ...ids: string[]) => ({ book: slug, slug, lessons: ids.map(raw) });

  it('uses the sample only when there are no real books', () => {
    const sample = { s: file('sample', 's1') };
    expect(loadBooks({}, sample)).toMatchObject({ usingSample: true, books: [{ slug: 'sample' }] });
    const withReal = loadBooks({ r: file('real', 'r1') }, sample);
    expect(withReal.usingSample).toBe(false);
    expect(withReal.books.map((b) => b.slug)).toEqual(['real']);
  });

  it('skips malformed books and lessons, and a repeated lesson id', () => {
    expect(parseBook({ slug: 'x' })).toBeNull();
    expect(parseBook('nope')).toBeNull();
    const broken = { book: 'B', slug: 'b', lessons: [raw('ok'), { ...raw('bad'), original: '' }, 5] };
    expect(parseBook(broken)?.lessons.map((l) => l.id)).toEqual(['ok']);
    const { books } = loadBooks({ a: file('a', 'dup', 'a2'), b: file('b', 'dup', 'b2') }, {});
    expect(books.map((b) => b.lessons.map((l) => l.id))).toEqual([['dup', 'a2'], ['b2']]);
  });

  it('the bundled sample has valid lessons with every field', async () => {
    const sample = (await import('../../../content/daily-read/sample/sample.json')).default;
    const parsed = parseBook(sample);
    expect(parsed?.lessons).toHaveLength(3);
    for (const l of parsed?.lessons ?? []) expect(l.recall.length).toBeGreaterThan(0);
  });
});
