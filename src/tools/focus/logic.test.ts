import { describe, expect, it } from 'vitest';
import { formatClock, summarizeDay } from './logic';

describe('focus logic', () => {
  it('formats the clock, rounding up and never going negative', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5000)).toBe('00:00');
  });

  it("sums only the given day's sessions", () => {
    const sessions = [
      { id: '1', date: '2026-03-01', minutes: 25 },
      { id: '2', date: '2026-03-01', minutes: 25 },
      { id: '3', date: '2026-02-28', minutes: 25 },
    ];
    expect(summarizeDay(sessions, '2026-03-01')).toEqual({ count: 2, minutes: 50 });
    expect(summarizeDay(sessions, '2026-03-02')).toEqual({ count: 0, minutes: 0 });
  });
});
