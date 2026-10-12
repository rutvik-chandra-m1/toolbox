import type { Entity } from '@/shared/storage';

export const TOOL_ID = 'notifier';
export const COLLECTION = 'reminders';
export const ROUTE = '/notifier';
export const NOTIFICATION_TITLE = 'Reminder';

export interface Reminder extends Entity {
  id: string;
  /** Exactly what the user typed: shown as the notification body unchanged. */
  message: string;
  /** When to notify, epoch milliseconds. */
  at: number;
  createdAt: number;
  /** Set when the browser showed it; stays null if the app was closed at that moment. */
  deliveredAt: number | null;
}

export interface ReminderDraft {
  message: string;
  /** `YYYY-MM-DD` from <input type="date"> */
  date: string;
  /** `HH:MM` from <input type="time"> */
  time: string;
}
