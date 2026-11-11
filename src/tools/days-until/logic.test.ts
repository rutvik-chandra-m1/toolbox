import { describe, expect, it } from 'vitest';
import { countdowns, daysBetween, describeDays, nextOccurrence, type DayEvent } from './logic';

describe('days-until logic', () => {
  it('counts whole days across months, leap days and backwards', () => {
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(daysBetween('2028-02-27', '2028-03-01')).toBe(3);
    expect(daysBetween('2026-03-01', '2026-02-27')).toBe(-2);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('moves a passed yearly event to its next anniversary and leaves one-off events alone', () => {
    expect(nextOccurrence({ date: '1995-06-10', yearly: true }, '2026-03-01')).toBe('2026-06-10');
    expect(nextOccurrence({ date: '1995-02-10', yearly: true }, '2026-03-01')).toBe('2027-02-10');
    expect(nextOccurrence({ date: '1995-03-01', yearly: true }, '2026-03-01')).toBe('2026-03-01');
    expect(nextOccurrence({ date: '2000-02-29', yearly: true }, '2026-01-01')).toBe('2026-02-28');
    expect(nextOccurrence({ date: '2020-01-01', yearly: false }, '2026-03-01')).toBe('2020-01-01');
    expect(nextOccurrence({ date: '2030-01-01', yearly: true }, '2026-03-01')).toBe('2030-01-01');
  });

  it('words the count', () => {
    expect([0, 1, -1, 12, -12].map(describeDays)).toEqual(['Today', 'Tomorrow', 'Yesterday', 'In 12 days', '12 days ago']);
  });

  it('lists upcoming events soonest first, then past ones most recent first', () => {
    const event = (id: string, date: string, yearly = false): DayEvent => ({ id, name: id, date, yearly });
    const list = countdowns(
      [event('old', '2025-01-01'), event('trip', '2026-04-01'), event('recent', '2026-02-20'), event('bday', '1990-03-05', true)],
      '2026-03-01',
    );
    expect(list.map((c) => c.event.id)).toEqual(['bday', 'trip', 'recent', 'old']);
    expect(list[0]?.days).toBe(4);
  });
});
