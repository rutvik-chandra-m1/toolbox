import { createId } from '@/shared/lib/id';
import type { NotificationService } from '@/shared/notifications';
import type { Collection } from '@/shared/storage';
import { validateDraft } from './logic';
import { ROUTE, type Reminder, type ReminderDraft } from './types';

export interface ReminderDeps {
  now?: () => number;
  newId?: () => string;
}

/** Reminder operations: every change to storage is mirrored in the scheduled notifications. */
export function createReminderRepository(
  collection: Collection<Reminder>,
  notifications: NotificationService,
  { now = Date.now, newId = createId }: ReminderDeps = {},
) {
  // The message is the notification's title (shown large and bold); there is no separate heading.
  const schedule = (r: Reminder) => notifications.schedule(r.id, r.message, '', new Date(r.at), { route: ROUTE });

  function valid(draft: ReminderDraft) {
    const result = validateDraft(draft, now());
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  return {
    async add(draft: ReminderDraft): Promise<Reminder> {
      const { message, at } = valid(draft);
      const reminder: Reminder = { id: newId(), message, at, createdAt: now(), deliveredAt: null };
      await collection.put(reminder);
      await schedule(reminder);
      return reminder;
    },

    /** Edit = cancel the old notification, then schedule the new one. */
    async update(id: string, draft: ReminderDraft): Promise<void> {
      const { message, at } = valid(draft);
      const existing = await collection.get(id);
      if (!existing) throw new Error('That reminder no longer exists.');
      await notifications.cancel(id);
      const updated: Reminder = { ...existing, message, at, deliveredAt: null };
      await collection.put(updated);
      await schedule(updated);
    },

    async remove(id: string): Promise<void> {
      await notifications.cancel(id);
      await collection.remove(id);
    },

    /** Deletes every reminder whose time has passed; resolves to how many. */
    async clearPast(): Promise<number> {
      const t = now();
      const ids = (await collection.getAll()).filter((r) => r.at <= t).map((r) => r.id);
      if (ids.length > 0) await collection.removeMany(ids);
      return ids.length;
    },

    async markDelivered(id: string): Promise<void> {
      const reminder = await collection.get(id);
      if (reminder && reminder.deliveredAt === null) await collection.put({ ...reminder, deliveredAt: now() });
    },

    /** On app start: re-arm every upcoming reminder (browser timers die with the page; Android may have been force-stopped). */
    async restore(): Promise<number> {
      const t = now();
      const upcoming = (await collection.getAll()).filter((r) => r.at > t);
      await Promise.all(upcoming.map(schedule));
      return upcoming.length;
    },
  };
}

export type ReminderRepository = ReturnType<typeof createReminderRepository>;
