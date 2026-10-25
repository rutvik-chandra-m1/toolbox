import type {
  NotificationAction,
  NotificationEvent,
  NotificationPermission,
  NotificationService,
  ScheduleOptions,
} from './types';

const CHANNEL_ID = 'reminders';
const CHANNEL_NAME = 'Reminders';
/** Roughly what fits on one title line on a phone. */
const LONG_TITLE = 40;

/** Android needs a 32-bit integer id; derive a stable one from the string id (FNV-1a). */
export function toNativeId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 2147483646) + 1; // 1..2^31-1
}

const toPermission = (state: string): NotificationPermission =>
  state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';

/** The app's own native plugin (android/app/src/main/java/app/toolbox/personal/RichNotificationsPlugin.java). */
interface RichPlugin {
  schedule(entry: {
    id: string;
    notifId: number;
    title: string;
    body: string;
    at: number;
    route?: string;
    channelId: string;
    channelName: string;
    icon?: string;
    color?: string;
    sticky: boolean;
    actions: NotificationAction[];
  }): Promise<void>;
  cancel(options: { id: string }): Promise<void>;
  getPending(): Promise<{ notifications: Array<{ id: string; title: string; body: string; at: number }> }>;
  takeEvents(): Promise<{ events: NotificationEvent[] }>;
  addListener(event: 'notificationOpened', listener: (data: { id: string; route?: string }) => void): Promise<unknown>;
}

/** Notifications that need a channel of their own, sticky behaviour or buttons go through the app's native engine. */
const needsRichEngine = (o: ScheduleOptions) => o.channel !== undefined || o.sticky === true || (o.actions?.length ?? 0) > 0;

/**
 * Android implementation on @capacitor/local-notifications. The OS fires the
 * notification from an exact alarm (allowWhileIdle), so it arrives with the
 * app closed and the phone locked; the plugin re-arms it after a reboot.
 *
 * Notifications that ask for `channel`, `sticky` or `actions` use the app's own
 * RichNotifications plugin instead, which supports what Capacitor's does not:
 * re-posting a swiped ongoing notification and buttons that act without opening the app.
 */
export function createAndroidNotifications(): NotificationService {
  let ready: ReturnType<typeof setup> | undefined;
  let richReady: ReturnType<typeof setupRich> | undefined;

  async function setup() {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    // High importance: shows as a heads-up banner and on the lock screen.
    await LocalNotifications.createChannel({ id: CHANNEL_ID, name: CHANNEL_NAME, importance: 5, visibility: 1 });
    // Tapping a notification opens the screen it came from (also after a cold start: the event is retained).
    await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      const route: unknown = notification.extra?.route;
      if (typeof route === 'string') window.location.hash = route;
    });
    // Wrapped: Capacitor plugins are proxies that answer `.then`, so one must never be a promise's value.
    return { ln: LocalNotifications };
  }
  async function setupRich() {
    const { registerPlugin } = await import('@capacitor/core');
    const rich = registerPlugin<RichPlugin>('RichNotifications');
    // Same for this engine: a tap or "Read now" (also one that cold-started the app) opens its route.
    await rich.addListener('notificationOpened', ({ route }) => {
      if (route) window.location.hash = route;
    });
    return { rich };
  }
  const plugin = () => (ready ??= setup());
  const richPlugin = () => (richReady ??= setupRich());
  // Set up at once: a tap that cold-started the app must be routed even if nothing else uses the service.
  void plugin().catch((error: unknown) => console.error('Notifications are unavailable', error));
  void richPlugin().catch((error: unknown) => console.error('Notifications are unavailable', error));

  return {
    platform: 'android',
    firesWhenClosed: true,
    async checkPermission() {
      return toPermission((await (await plugin()).ln.checkPermissions()).display);
    },
    async requestPermission() {
      return toPermission((await (await plugin()).ln.requestPermissions()).display);
    },
    async schedule(id: string, title: string, body: string, at: Date, options: ScheduleOptions = {}) {
      if (needsRichEngine(options)) {
        await (
          await richPlugin()
        ).rich.schedule({
          id,
          notifId: toNativeId(options.slot ?? id),
          title,
          body,
          at: at.getTime(),
          route: options.route,
          channelId: options.channel?.id ?? CHANNEL_ID,
          channelName: options.channel?.name ?? CHANNEL_NAME,
          icon: options.channel?.icon,
          color: options.channel?.color,
          sticky: options.sticky === true,
          actions: options.actions ?? [],
        });
        return;
      }
      // Android cuts a title to one line, so a long title-only notification goes in the
      // (expandable) text instead, with no heading, rather than being shown twice.
      const long = !body && title.length > LONG_TITLE;
      await (await plugin()).ln.schedule({
        notifications: [
          {
            id: toNativeId(id),
            title: long ? '' : title,
            body: long ? title : body,
            largeBody: long ? title : body || undefined, // expanded view shows the whole text
            channelId: CHANNEL_ID,
            schedule: { at, allowWhileIdle: true },
            extra: { id, route: options.route },
          },
        ],
      });
    },
    async cancel(id) {
      await Promise.all([
        plugin().then(({ ln }) => ln.cancel({ notifications: [{ id: toNativeId(id) }] })),
        richPlugin().then(({ rich }) => rich.cancel({ id })),
      ]);
    },
    async listPending() {
      const [{ ln }, { rich }] = await Promise.all([plugin(), richPlugin()]);
      const [{ notifications }, own] = await Promise.all([ln.getPending(), rich.getPending()]);
      return [
        ...notifications.map((n) => ({
          id: typeof n.extra?.id === 'string' ? n.extra.id : String(n.id),
          title: n.title,
          body: n.body,
          at: n.schedule?.at ? new Date(n.schedule.at) : null,
        })),
        ...own.notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, at: new Date(n.at) })),
      ];
    },
    async canScheduleExact() {
      return (await (await plugin()).ln.checkExactNotificationSetting()).exact_alarm === 'granted';
    },
    async openExactAlarmSettings() {
      await (await plugin()).ln.changeExactNotificationSetting();
    },
    onDelivered() {
      return () => {};
    },
    async takeEvents() {
      return (await (await richPlugin()).rich.takeEvents()).events;
    },
  };
}
