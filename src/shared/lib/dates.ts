/**
 * Calendar-date helpers. A "date" here is an ISO `YYYY-MM-DD` string in the
 * user's local time zone (what `<input type="date">` produces) - never a UTC
 * timestamp, so a due date can't shift by a day when the time zone changes.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formats a Date as local `YYYY-MM-DD`. */
export function toISODate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** Parses `YYYY-MM-DD` into a local Date, or null if it is not a real calendar date. */
export function parseISODate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  const roundTrips =
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return roundTrips ? date : null;
}

export function isValidISODate(value: string): boolean {
  return parseISODate(value) !== null;
}

export function addDays(value: string, days: number): string {
  const date = parseISODate(value);
  if (!date) throw new Error(`Invalid ISO date: ${value}`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Formats e.g. "Mon, 5 Oct" (adds the year when it is not `referenceYear`). */
export function formatISODate(
  value: string,
  options: { locale?: string; referenceYear?: number } = {},
): string {
  const date = parseISODate(value);
  if (!date) return value;
  const { locale, referenceYear = new Date().getFullYear() } = options;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== referenceYear ? { year: 'numeric' } : {}),
  }).format(date);
}
