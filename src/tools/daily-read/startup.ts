import { getNotificationService } from '@/shared/notifications';
import { getDefaultStorage } from '@/shared/storage';
import { catalog } from './content';
import { createRepository } from './repository';
import { syncSchedule } from './scheduler';

/** Runs each time the app opens (see the manifest's onAppStart). */
export async function startDailyRead(): Promise<void> {
  const deps = { repo: createRepository(getDefaultStorage()), books: catalog, notifications: getNotificationService() };
  await syncSchedule(deps);
  // Buttons pressed on a notification while the app was in the background are picked up when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncSchedule(deps).catch((error: unknown) => console.error('Daily Read could not refresh its schedule', error));
    }
  });
}
