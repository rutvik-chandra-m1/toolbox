import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.hoisted(() => vi.fn(() => false));
// The app's own native plugin (RichNotifications), used for channels, sticky notifications and buttons.
const rich = vi.hoisted(() => ({
  schedule: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  getPending: vi.fn(async () => ({ notifications: [] as unknown[] })),
  takeEvents: vi.fn(async () => ({ events: [] as unknown[] })),
  addListener: vi.fn(async () => ({ remove: async () => {} })),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform }, registerPlugin: () => rich }));

const plugin = vi.hoisted(() => ({
  createChannel: vi.fn(async () => {}),
  addListener: vi.fn(async () => ({ remove: async () => {} })),
  schedule: vi.fn(async () => ({ notifications: [] })),
  cancel: vi.fn(async () => {}),
  getPending: vi.fn(async () => ({ notifications: [] as unknown[] })),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' })),
  changeExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' })),
}));
// Like the real Capacitor plugin: a proxy that answers any property, including "then".
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: new Proxy(plugin, {
    get: (target, key) =>
      key in target
        ? target[key as keyof typeof target]
        : () => {
            throw new Error(`"LocalNotifications.${String(key)}()" is not implemented on android`);
          },
  }),
}));

import { toNativeId } from './android';
import { createNotificationService } from './index';

const MESSAGE = '  Ask teacher about AICTE points 🎓\nline two  '; // spaces, emoji and a newline must survive

describe('platform branching', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the Android plugin inside the Capacitor app', async () => {
    isNativePlatform.mockReturnValue(true);
    const service = createNotificationService();
    expect(service.platform).toBe('android');
    expect(service.firesWhenClosed).toBe(true);

    await service.schedule('r1', 'Reminder', MESSAGE, new Date(2030, 0, 2, 9, 30));
    expect(plugin.schedule).toHaveBeenCalledOnce();
  });

  it('uses the browser implementation everywhere else, and never loads the plugin', async () => {
    isNativePlatform.mockReturnValue(false);
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted' }));
    const service = createNotificationService();
    expect(service.platform).toBe('web');
    expect(service.firesWhenClosed).toBe(false);

    await service.schedule('r1', 'Reminder', MESSAGE, new Date(Date.now() + 60_000));
    await service.cancel('r1');
    expect(plugin.schedule).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('Android implementation', () => {
  beforeEach(() => vi.clearAllMocks());
  const android = () => createNotificationService(true);

  it('schedules an exact, allow-while-idle notification with the message unchanged', async () => {
    const at = new Date(2030, 0, 2, 9, 30);
    await android().schedule('r1', 'Reminder', MESSAGE, at, { route: '/notifier' });

    expect(plugin.schedule).toHaveBeenCalledWith({
      notifications: [
        {
          id: toNativeId('r1'),
          title: 'Reminder',
          body: MESSAGE,
          largeBody: MESSAGE,
          channelId: 'reminders',
          schedule: { at, allowWhileIdle: true },
          extra: { id: 'r1', route: '/notifier' },
        },
      ],
    });
  });

  it('title-only: a short text is the (large) title; a long one becomes expandable text with no heading', async () => {
    await android().schedule('short', 'ask for dinner', '', new Date(2030, 0, 1));
    await android().schedule('long', MESSAGE, '', new Date(2030, 0, 1));
    const [short, long] = plugin.schedule.mock.calls.map((c) => (c as unknown as [{ notifications: Record<string, unknown>[] }])[0].notifications[0]);
    expect(short).toMatchObject({ title: 'ask for dinner', body: '', largeBody: undefined });
    expect(long).toMatchObject({ title: '', body: MESSAGE, largeBody: MESSAGE });
  });

  it('creates a high-importance channel and a tap handler once', async () => {
    const service = android();
    await service.schedule('a', 'T', 'b', new Date());
    await service.cancel('a');
    expect(plugin.createChannel).toHaveBeenCalledOnce();
    expect(plugin.createChannel).toHaveBeenCalledWith(expect.objectContaining({ importance: 5 }));
    expect(plugin.addListener).toHaveBeenCalledWith('localNotificationActionPerformed', expect.any(Function));
  });

  it('tapping a notification opens its route', async () => {
    await android().checkPermission();
    const handler = (plugin.addListener.mock.calls[0] as unknown as [string, (e: unknown) => void])[1];
    handler({ notification: { extra: { route: '/notifier' } } });
    expect(window.location.hash).toBe('#/notifier');
  });

  it('registers the tap handler as soon as it exists, so a tap that launched the app is routed', async () => {
    android(); // created, but nothing called on it (e.g. no reminders to restore)
    await vi.waitFor(() =>
      expect(plugin.addListener).toHaveBeenCalledWith('localNotificationActionPerformed', expect.any(Function)),
    );
  });

  it('cancels by the same numeric id it scheduled with (in both engines)', async () => {
    await android().cancel('r1');
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: toNativeId('r1') }] });
    expect(rich.cancel).toHaveBeenCalledWith({ id: 'r1' });
  });

  it('lists pending notifications by their original string id', async () => {
    plugin.getPending.mockResolvedValueOnce({
      notifications: [{ id: 5, title: 'Reminder', body: 'x', schedule: { at: new Date(2030, 0, 1) }, extra: { id: 'r1' } }],
    });
    expect(await android().listPending()).toEqual([{ id: 'r1', title: 'Reminder', body: 'x', at: new Date(2030, 0, 1) }]);
  });

  it('a plain notification never touches the rich engine', async () => {
    await android().schedule('plain', 'T', 'b', new Date(2030, 0, 1), { route: '/notifier' });
    expect(plugin.schedule).toHaveBeenCalledOnce();
    expect(rich.schedule).not.toHaveBeenCalled();
  });

  it('a channel, sticky flag or buttons send it to the rich engine, with its own channel, icon and colour', async () => {
    const at = new Date(2030, 0, 2, 8, 0);
    await android().schedule('lesson-1', 'Title', 'Hook', at, {
      route: '/daily-read/lesson/x',
      slot: 'lesson',
      sticky: true,
      channel: { id: 'daily-read', name: 'Daily Read', icon: 'ic_stat_book', color: '#d97706' },
      actions: [{ id: 'snooze', title: 'Snooze 1 hr', kind: 'snooze', minutes: 60 }],
    });

    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(rich.schedule).toHaveBeenCalledWith({
      id: 'lesson-1',
      notifId: toNativeId('lesson'), // the slot decides which notification it replaces
      title: 'Title',
      body: 'Hook',
      at: at.getTime(),
      route: '/daily-read/lesson/x',
      channelId: 'daily-read',
      channelName: 'Daily Read',
      icon: 'ic_stat_book',
      color: '#d97706',
      sticky: true,
      actions: [{ id: 'snooze', title: 'Snooze 1 hr', kind: 'snooze', minutes: 60 }],
    });
  });

  it('lists pending notifications from both engines', async () => {
    rich.getPending.mockResolvedValueOnce({ notifications: [{ id: 'lesson-1', title: 'T', body: 'b', at: 1_900_000_000_000 }] });
    expect(await android().listPending()).toEqual([{ id: 'lesson-1', title: 'T', body: 'b', at: new Date(1_900_000_000_000) }]);
  });

  it('a tap or "Read now" on a rich notification opens its route, also after a cold start', async () => {
    const service = android();
    await service.checkPermission();
    await vi.waitFor(() => expect(rich.addListener).toHaveBeenCalledWith('notificationOpened', expect.any(Function)));
    const handler = (rich.addListener.mock.calls[0] as unknown as [string, (e: unknown) => void])[1];
    handler({ id: 'lesson-1', route: '/daily-read/lesson/x' });
    expect(window.location.hash).toBe('#/daily-read/lesson/x');
  });

  it('reports what the buttons did while the app was closed', async () => {
    const events = [{ type: 'dismissed', id: 'lesson-2030-01-02', at: 5 }];
    rich.takeEvents.mockResolvedValueOnce({ events });
    expect(await android().takeEvents()).toEqual(events);
  });

  it('maps permission and exact-alarm states', async () => {
    plugin.checkPermissions.mockResolvedValueOnce({ display: 'denied' });
    expect(await android().checkPermission()).toBe('denied');
    plugin.requestPermissions.mockResolvedValueOnce({ display: 'prompt-with-rationale' });
    expect(await android().requestPermission()).toBe('prompt');
    plugin.checkExactNotificationSetting.mockResolvedValueOnce({ exact_alarm: 'denied' });
    expect(await android().canScheduleExact()).toBe(false);
    await android().openExactAlarmSettings();
    expect(plugin.changeExactNotificationSetting).toHaveBeenCalled();
  });

  it('turns string ids into stable, positive 32-bit integers', () => {
    expect(toNativeId('abc')).toBe(toNativeId('abc'));
    expect(toNativeId('abc')).not.toBe(toNativeId('abd'));
    for (const id of ['', 'x', crypto.randomUUID(), 'z'.repeat(500)]) {
      const n = toNativeId(id);
      expect(Number.isInteger(n) && n > 0 && n <= 2 ** 31 - 1).toBe(true);
    }
  });
});

describe('browser implementation', () => {
  const shown: Array<{ title: string; options: NotificationOptions }> = [];
  let permission: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 1, 12, 0, 0));
    shown.length = 0;
    permission = 'granted';
    const FakeNotification = vi.fn(function (this: object, title: string, options: NotificationOptions) {
      shown.push({ title, options });
    });
    Object.defineProperty(FakeNotification, 'permission', { get: () => permission });
    Object.assign(FakeNotification, { requestPermission: vi.fn(async () => (permission = 'granted')) });
    vi.stubGlobal('Notification', FakeNotification);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const web = () => createNotificationService(false);

  it('shows the notification at exactly the chosen time, with the message unchanged', async () => {
    const service = web();
    await service.schedule('r1', 'Reminder', MESSAGE, new Date(2030, 0, 1, 12, 1, 0));

    vi.advanceTimersByTime(59_999);
    expect(shown).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([{ title: 'Reminder', options: { body: MESSAGE, tag: 'r1' } }]);
    expect(await service.listPending()).toEqual([]);
  });

  it('cancel and re-schedule replace the earlier timer', async () => {
    const service = web();
    await service.schedule('r1', 'Reminder', 'old', new Date(2030, 0, 1, 12, 1));
    await service.schedule('r1', 'Reminder', 'new', new Date(2030, 0, 1, 12, 2));
    await service.schedule('r2', 'Reminder', 'gone', new Date(2030, 0, 1, 12, 1));
    await service.cancel('r2');

    expect((await service.listPending()).map((p) => p.body)).toEqual(['new']);
    vi.advanceTimersByTime(5 * 60_000);
    expect(shown.map((s) => s.options.body)).toEqual(['new']);
  });

  it('handles times further away than setTimeout allows (~24.8 days)', async () => {
    const service = web();
    const at = new Date(2030, 1, 15, 12, 0); // 45 days ahead
    await service.schedule('far', 'Reminder', 'far away', at);

    vi.advanceTimersByTime(at.getTime() - Date.now() - 1);
    expect(shown).toHaveLength(0); // an overflowing timeout would have fired at once
    vi.advanceTimersByTime(1);
    expect(shown).toHaveLength(1);
  });

  it('reports deliveries, but shows nothing (and reports nothing) without permission', async () => {
    const service = web();
    const delivered: string[] = [];
    service.onDelivered((id) => delivered.push(id));

    await service.schedule('ok', 'Reminder', 'a', new Date(2030, 0, 1, 12, 0, 1));
    vi.advanceTimersByTime(1000);
    permission = 'denied';
    await service.schedule('blocked', 'Reminder', 'b', new Date(2030, 0, 1, 12, 0, 2));
    vi.advanceTimersByTime(1000);

    expect(delivered).toEqual(['ok']);
    expect(shown).toHaveLength(1);
  });

  it('shows rich notifications as plain ones, and a slot makes later ones replace earlier ones', async () => {
    const service = web();
    await service.schedule('lesson-1', 'T', 'b', new Date(2030, 0, 1, 12, 0, 1), { slot: 'lesson', sticky: true, actions: [] });
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual([{ title: 'T', options: { body: 'b', tag: 'lesson' } }]);
    expect(await service.takeEvents()).toEqual([]);
  });

  it('maps permissions and asks only when the user has not answered', async () => {
    permission = 'default';
    const service = web();
    expect(await service.checkPermission()).toBe('prompt');
    expect(await service.requestPermission()).toBe('granted');
    permission = 'denied';
    expect(await service.requestPermission()).toBe('denied');
    expect(Notification.requestPermission).toHaveBeenCalledOnce();
  });

  it('says "unsupported" where the browser has no Notification API', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(await web().checkPermission()).toBe('unsupported');
  });
});
