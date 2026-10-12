import type { NotificationPermission, NotificationService, ScheduleOptions } from './types';

const CHANNEL_ID = 'reminders';

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

/**
 * Android implementation on @capacitor/local-notifications. The OS fires the
 * notification from an exact alarm (allowWhileIdle), so it arrives with the
 * app closed and the phone locked; the plugin re-arms it after a reboot.
 */
export function createAndroidNotifications(): NotificationService {
  let ready: ReturnType<typeof setup> | undefined;

  async function setup() {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    // High importance: shows as a heads-up banner and on the lock screen.
    await LocalNotifications.createChannel({ id: CHANNEL_ID, name: 'Reminders', importance: 5, visibility: 1 });
    // Tapping a notification opens the screen it came from (also after a cold start: the event is retained).
    await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      const route: unknown = notification.extra?.route;
      if (typeof route === 'string') window.location.hash = route;
    });
    // Wrapped: Capacitor plugins are proxies that answer `.then`, so one must never be a promise's value.
    return { ln: LocalNotifications };
  }
  const plugin = () => (ready ??= setup());
  // Set up at once: a tap that cold-started the app must be routed even if nothing else uses the service.
  void plugin().catch((error: unknown) => console.error('Notifications are unavailable', error));

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
      await (await plugin()).ln.schedule({
        notifications: [
          {
            id: toNativeId(id),
            title,
            body,
            largeBody: body, // expanded view shows the whole message
            channelId: CHANNEL_ID,
            schedule: { at, allowWhileIdle: true },
            extra: { id, route: options.route },
          },
        ],
      });
    },
    async cancel(id) {
      await (await plugin()).ln.cancel({ notifications: [{ id: toNativeId(id) }] });
    },
    async listPending() {
      const { notifications } = await (await plugin()).ln.getPending();
      return notifications.map((n) => ({
        id: typeof n.extra?.id === 'string' ? n.extra.id : String(n.id),
        title: n.title,
        body: n.body,
        at: n.schedule?.at ? new Date(n.schedule.at) : null,
      }));
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
  };
}
