import { describe, expect, it } from 'vitest';
import { lastDays, streak, toggleDay } from './logic';

describe('habits logic', () => {
  it('toggles a day on and off', () => {
    expect(toggleDay([], '2026-03-01')).toEqual(['2026-03-01']);
    expect(toggleDay(['2026-03-01'], '2026-03-01')).toEqual([]);
  });

  it('counts the streak up to today, or up to yesterday when today is not ticked yet', () => {
    expect(streak(['2026-02-27', '2026-02-28', '2026-03-01'], '2026-03-01')).toBe(3);
    expect(streak(['2026-02-27', '2026-02-28'], '2026-03-01')).toBe(2);
    expect(streak(['2026-02-27'], '2026-03-01')).toBe(0);
    expect(streak([], '2026-03-01')).toBe(0);
  });

  it('lists the last days oldest first, across a month boundary', () => {
    expect(lastDays('2026-03-01', 3)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});
