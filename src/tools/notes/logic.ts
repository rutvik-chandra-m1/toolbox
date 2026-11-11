import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'notes';

export interface Note extends Entity {
  text: string;
  pinned: boolean;
  updatedAt: number;
}

/** Notes containing `query` (any case), pinned first, then most recently changed. */
export function visibleNotes(notes: readonly Note[], query = ''): Note[] {
  const q = query.trim().toLowerCase();
  return notes
    .filter((n) => n.text.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}
