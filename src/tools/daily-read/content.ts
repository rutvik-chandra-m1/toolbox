import type { Book, Lesson } from './types';

// Books are plain JSON files added by hand (see content/daily-read/ADD_BOOK.md), bundled at build time.
// The real ones are git-ignored; the sample is used only while there are none.
const REAL = import.meta.glob<unknown>('/content/daily-read/books/*.json', { eager: true, import: 'default' });
const SAMPLE = import.meta.glob<unknown>('/content/daily-read/sample/*.json', { eager: true, import: 'default' });

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function parseLesson(raw: unknown): Lesson | null {
  if (!isRecord(raw)) return null;
  const { id, title, hook, quick, original, explanation, realWorld, extraThoughts, tryToday, recall } = raw;
  if (![id, title, hook, quick, original, explanation, realWorld, extraThoughts, tryToday].every(isText)) return null;
  if (!Array.isArray(recall)) return null;
  const questions = recall.filter(isRecord).filter((r) => isText(r.q) && isText(r.a));
  return {
    id: id as string,
    title: title as string,
    hook: hook as string,
    quick: quick as string,
    original: original as string,
    explanation: explanation as string,
    realWorld: realWorld as string,
    extraThoughts: extraThoughts as string,
    tryToday: tryToday as string,
    recall: questions.map((r) => ({ q: r.q as string, a: r.a as string })),
  };
}

/** Returns null for a file that is not a book; skips lessons that are incomplete (content/daily-read/validate.py reports them). */
export function parseBook(raw: unknown): Book | null {
  if (!isRecord(raw) || !isText(raw.slug) || !isText(raw.book) || !Array.isArray(raw.lessons)) return null;
  const lessons = raw.lessons.map(parseLesson).filter((lesson): lesson is Lesson => lesson !== null);
  return lessons.length > 0 ? { slug: raw.slug, title: raw.book, lessons } : null;
}

/** Real books if there are any, otherwise the sample. Lesson ids are unique across books (the first one wins). */
export function loadBooks(real: Record<string, unknown>, sample: Record<string, unknown>) {
  const parse = (files: Record<string, unknown>) =>
    Object.keys(files)
      .sort()
      .map((path) => parseBook(files[path]))
      .filter((book): book is Book => book !== null);
  const realBooks = parse(real);
  const books = realBooks.length > 0 ? realBooks : parse(sample);

  const seen = new Set<string>();
  const unique = books.map((book) => ({ ...book, lessons: book.lessons.filter((l) => !seen.has(l.id) && seen.add(l.id)) }));
  return { books: unique.filter((book) => book.lessons.length > 0), usingSample: realBooks.length === 0 };
}

export const { books: catalog, usingSample } = loadBooks(REAL, SAMPLE);
