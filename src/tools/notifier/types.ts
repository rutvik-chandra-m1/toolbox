import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'notifier';
export const COLLECTION = 'reminders';
export const ROUTE = '/notifier';

/** The notification's two buttons; each id is also what the reminder records. */
export type ReminderOutcome = 'done' | 'skipped';

export interface Reminder extends Entity {
  id: string;
  /** Exactly what the user typed: the notification's only text (its title), unchanged. */
  message: string;
  /** When to notify, epoch milliseconds. */
  at: number;
  createdAt: number;
  /** Set when the browser showed it; stays null if the app was closed at that moment. */
  deliveredAt: number | null;
  /** Which notification button answered it. Reminders saved before the buttons existed have none. */
  outcome?: ReminderOutcome | null;
}

export interface ReminderDraft {
  message: string;
  /** `YYYY-MM-DD` from <input type="date"> */
  date: string;
  /** `HH:MM` from <input type="time"> */
  time: string;
}
