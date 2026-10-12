import { getNotificationService } from '@/shared/notifications';
import { getDefaultStorage } from '@/shared/storage';
import { createReminderRepository } from './repository';
import { COLLECTION, TOOL_ID, type Reminder } from './types';

/** Runs each time the app opens (see the manifest's onAppStart). */
export async function restoreReminders(): Promise<void> {
  const notifications = getNotificationService();
  const repo = createReminderRepository(getDefaultStorage().collection<Reminder>(TOOL_ID, COLLECTION), notifications);
  // Remember which reminders the browser actually showed, so the rest can be listed as "Missed".
  notifications.onDelivered((id) => void repo.markDelivered(id));
  await repo.restore();
}
