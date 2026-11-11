import { describe, expect, it } from 'vitest';
import { isBlank, newestFirst, preview } from './logic';

describe('journal logic', () => {
  it('treats an entry with no text and no mood as blank', () => {
    expect(isBlank({ text: '  \n', mood: 0 })).toBe(true);
    expect(isBlank({ text: '', mood: 3 })).toBe(false);
    expect(isBlank({ text: 'hi', mood: 0 })).toBe(false);
  });

  it('sorts days newest first', () => {
    const ids = newestFirst([
      { id: '2026-02-28', text: '', mood: 1 },
      { id: '2026-03-02', text: '', mood: 1 },
      { id: '2025-12-31', text: '', mood: 1 },
    ]).map((e) => e.id);
    expect(ids).toEqual(['2026-03-02', '2026-02-28', '2025-12-31']);
  });

  it('previews on one line and shortens long text', () => {
    expect(preview('  a\n\nb  ')).toBe('a b');
    expect(preview('abcdefghij', 5)).toBe('abcd…');
  });
});
