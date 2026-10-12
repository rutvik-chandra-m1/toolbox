import { Capacitor } from '@capacitor/core';
import { createAndroidNotifications } from './android';
import type { NotificationService } from './types';
import { createWebNotifications } from './web';

export type { NotificationPermission, NotificationService, PendingNotification, ScheduleOptions } from './types';

/** Picks the implementation for the platform the app is running on. */
export function createNotificationService(native = Capacitor.isNativePlatform()): NotificationService {
  return native ? createAndroidNotifications() : createWebNotifications();
}

let service: NotificationService | undefined;

/** The app-wide notification service (one instance, so browser timers are shared). */
export function getNotificationService(): NotificationService {
  service ??= createNotificationService();
  return service;
}
