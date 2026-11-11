import { describe, expect, it } from 'vitest';
import { visibleNotes, type Note } from './logic';

const note = (id: string, text: string, updatedAt: number, pinned = false): Note => ({ id, text, updatedAt, pinned });

describe('notes logic', () => {
  const notes = [note('a', 'Milk and eggs', 1), note('b', 'Wifi password', 3), note('c', 'Gift ideas: MILK frother', 2, true)];

  it('puts pinned notes first, then the most recently changed', () => {
    expect(visibleNotes(notes).map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('searches without caring about case, and does not change the input', () => {
    expect(visibleNotes(notes, ' milk ').map((n) => n.id)).toEqual(['c', 'a']);
    expect(visibleNotes(notes, 'nothing')).toEqual([]);
    expect(notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
});
