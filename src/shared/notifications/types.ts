export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface PendingNotification {
  id: string;
  title: string;
  body: string;
  at: Date | null;
}

export interface ScheduleOptions {
  /** App route to open when the notification is tapped, e.g. "/notifier". */
  route?: string;
}

/**
 * Shows notifications at a chosen time. Get one with `getNotificationService()`;
 * it picks the Android or browser implementation at runtime.
 */
export interface NotificationService {
  readonly platform: 'android' | 'web';
  /**
   * True on Android, where the OS delivers notifications even when the app is
   * closed. False in a browser: timers only run while the app is open.
   */
  readonly firesWhenClosed: boolean;
  /** Current permission, without asking the user. */
  checkPermission(): Promise<NotificationPermission>;
  /** Asks the user if they have not answered yet; returns the result. */
  requestPermission(): Promise<NotificationPermission>;
  /**
   * Shows `title` (large, bold) and `body` (unchanged; may be '' for a title-only notification) at `at`.
   * Scheduling an id again replaces it.
   */
  schedule(id: string, title: string, body: string, at: Date, options?: ScheduleOptions): Promise<void>;
  cancel(id: string): Promise<void>;
  listPending(): Promise<PendingNotification[]>;
  /** Android 12+: may it fire at the exact minute? Always true in a browser. */
  canScheduleExact(): Promise<boolean>;
  /** Android 12+: opens the "Alarms & reminders" setting. No-op in a browser. */
  openExactAlarmSettings(): Promise<void>;
  /**
   * Called when this app shows a notification itself (browser timers). On
   * Android the OS shows it, possibly while the app is closed, so this never fires.
   */
  onDelivered(listener: (id: string) => void): () => void;
}
