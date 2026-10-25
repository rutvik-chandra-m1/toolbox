export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface PendingNotification {
  id: string;
  title: string;
  body: string;
  at: Date | null;
  /** Android channel it was scheduled for, when it has one of its own. */
  channelId?: string;
}

/** A button under an Android notification. Browsers cannot show these, so nothing may depend on them. */
export interface NotificationAction {
  id: string;
  title: string;
  /**
   * `open`: opens the notification's route. `snooze`: hides it and shows it again after `minutes`.
   * `dismiss`: removes it and later reports a `dismissed` event (see `takeEvents`).
   */
  kind: 'open' | 'snooze' | 'dismiss';
  minutes?: number;
}

/** Own channel and look for a tool's notifications (Android). Default: the shared "Reminders" channel. */
export interface NotificationChannel {
  id: string;
  name: string;
  /** Name of a white status-bar icon in android/app/src/main/res/drawable, e.g. "ic_stat_book". */
  icon?: string;
  /** Accent colour for the icon, e.g. "#d97706". */
  color?: string;
  /**
   * Android shows the app's own icon next to a notification. Name of a PNG in
   * res/drawable-nodpi (e.g. "daily_read_logo") to show this tool's logo there instead.
   */
  logo?: string;
  /**
   * Name of a sound file in res/raw, without the extension (e.g. "daily_read_chime"). Android
   * fixes a channel's sound when it first creates the channel, so a different sound needs a new `id`.
   */
  sound?: string;
  /** Ids of older channels this one replaces; they are deleted when the first notification of this channel is shown. */
  replaces?: string[];
}

export interface ScheduleOptions {
  /** App route to open when the notification is tapped, e.g. "/notifier". */
  route?: string;
  /** Use a channel of its own (and the Android engine that supports `sticky` and `actions`). */
  channel?: NotificationChannel;
  /**
   * Notifications that share a slot replace each other when shown, so only the latest of
   * them is in the notification shade. Scheduling several days ahead under one slot is fine.
   */
  slot?: string;
  /**
   * Android: ongoing and not cleared by a tap; if the user swipes it away (Android 14+ allows that)
   * it is posted again at once. Only its `actions`, opening the route, or `cancel()` remove it.
   */
  sticky?: boolean;
  actions?: NotificationAction[];
}

/** Something the user did to a notification while the app was closed. */
export interface NotificationEvent {
  type: 'dismissed' | 'snoozed';
  /** The id the notification was scheduled with. */
  id: string;
  at: number;
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
  /** Cancels a scheduled notification, and removes it from the notification shade if it is showing. */
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
  /** Android: what the user did with notification buttons since last asked (each event is returned once). Browser: always empty. */
  takeEvents(): Promise<NotificationEvent[]>;
}
