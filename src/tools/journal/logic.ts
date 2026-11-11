import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'journal';

/** Index + 1 is the stored mood (1 = worst, 5 = best). */
export const MOODS = [
  { emoji: '😞', label: 'Awful' },
  { emoji: '😕', label: 'Bad' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😄', label: 'Great' },
] as const;

/** One entry per day: the id is the local `YYYY-MM-DD`. */
export interface Entry extends Entity {
  text: string;
  /** 1 to 5, or 0 when not chosen. */
  mood: number;
}

export const isBlank = (entry: Pick<Entry, 'text' | 'mood'>) => entry.text.trim() === '' && entry.mood === 0;

export function newestFirst(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.id.localeCompare(a.id));
}

/** First part of the text on one line, for the list of past days. */
export function preview(text: string, max = 100): string {
  const line = text.trim().replace(/\s+/g, ' ');
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
