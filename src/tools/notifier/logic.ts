import { parseISODate, toISODate } from '@/shared/lib/dates';
import type { Reminder, ReminderDraft } from './types';

export type DraftResult = { ok: true; message: string; at: number } | { ok: false; error: string };

/** Local date + time inputs -> epoch ms, or null if either is not a real value. */
export function combineDateTime(date: string, time: string): number | null {
  const day = parseISODate(date);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  day.setHours(hours, minutes, 0, 0);
  return day.getTime();
}

/** Checks a draft. The message is returned untouched: the notification must show it word for word. */
export function validateDraft(draft: ReminderDraft, now: number): DraftResult {
  if (!draft.message.trim()) return { ok: false, error: 'Please type a reminder message.' };
  const at = combineDateTime(draft.date, draft.time);
  if (at === null) return { ok: false, error: 'Please pick a date and a time.' };
  if (at <= now) return { ok: false, error: 'That time has already passed. Pick a time in the future.' };
  return { ok: true, message: draft.message, at };
}

/** Upcoming: soonest first. Past (fired or missed): most recent first. */
export function splitReminders(reminders: readonly Reminder[], now: number) {
  const upcoming = reminders.filter((r) => r.at > now).sort((a, b) => a.at - b.at || a.createdAt - b.createdAt);
  const past = reminders.filter((r) => r.at <= now).sort((a, b) => b.at - a.at || b.createdAt - a.createdAt);
  return { upcoming, past };
}

/**
 * A past reminder was "Sent" if it was shown. Android shows it even with the
 * app closed; a browser only while the app is open, so otherwise it was missed.
 */
export function pastStatus(reminder: Reminder, firesWhenClosed: boolean): 'Sent' | 'Missed' {
  return firesWhenClosed || reminder.deliveredAt !== null ? 'Sent' : 'Missed';
}

/** Draft values for editing an existing reminder. */
export function toDraft(reminder: Reminder): ReminderDraft {
  const at = new Date(reminder.at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { message: reminder.message, date: toISODate(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
}

/** Default for a new reminder: one hour from now, to the minute. */
export function defaultDraft(now: number): ReminderDraft {
  const { date, time } = toDraft({ id: '', message: '', at: now + 60 * 60 * 1000, createdAt: 0, deliveredAt: null });
  return { message: '', date, time };
}

export function formatWhen(at: number, now: number = Date.now()): string {
  const date = new Date(at);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
