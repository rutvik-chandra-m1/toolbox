import { describe, expect, it } from 'vitest';
import { addDays, formatISODate, isValidISODate, parseISODate, toISODate, todayISO } from './dates';

describe('toISODate / todayISO', () => {
  it('formats local date parts with zero padding', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('uses the local calendar day, not UTC, for late-evening times', () => {
    expect(todayISO(new Date(2026, 5, 15, 23, 59, 59))).toBe('2026-06-15');
    expect(todayISO(new Date(2026, 5, 15, 0, 0, 1))).toBe('2026-06-15');
  });
});

describe('parseISODate / isValidISODate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidISODate('2026-10-09')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true); // leap year
  });

  it('rejects impossible or malformed dates', () => {
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2027-02-29')).toBe(false); // not a leap year
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-1-1')).toBe(false);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate('tomorrow')).toBe(false);
    expect(parseISODate('2026-10-09T10:00')).toBeNull();
  });

  it('parses to local midnight', () => {
    const date = parseISODate('2026-10-09');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(9);
    expect(date?.getHours()).toBe(0);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('throws on an invalid date', () => {
    expect(() => addDays('nope', 1)).toThrow(/Invalid ISO date/);
  });
});

describe('formatISODate', () => {
  it('omits the year in the reference year and shows it otherwise', () => {
    expect(formatISODate('2026-10-05', { locale: 'en-US', referenceYear: 2026 })).toBe('Mon, Oct 5');
    expect(formatISODate('2027-01-02', { locale: 'en-US', referenceYear: 2026 })).toContain('2027');
  });

  it('returns the input unchanged when it is not a valid date', () => {
    expect(formatISODate('garbage')).toBe('garbage');
  });
});
