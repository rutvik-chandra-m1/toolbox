import type { NotificationPermission, NotificationService, ScheduleOptions } from './types';

/** setTimeout overflows above this (~24.8 days) and would fire at once. */
const MAX_DELAY = 2 ** 31 - 1;

interface Entry {
  title: string;
  body: string;
  at: Date;
  route?: string;
  /** Notifications with the same tag replace each other in the browser's notification list. */
  tag: string;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Browser implementation: the Web Notifications API plus in-page timers. Only
 * works while the app is open; the caller re-schedules from its own storage
 * each time the app starts.
 */
export function createWebNotifications(): NotificationService {
  const entries = new Map<string, Entry>();
  const listeners = new Set<(id: string) => void>();
  const supported = typeof Notification !== 'undefined';

  const permission = (): NotificationPermission => {
    if (!supported) return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  };

  function show(id: string, entry: Entry) {
    entries.delete(id);
    if (permission() !== 'granted') return;
    try {
      const notification = new Notification(entry.title, { body: entry.body, tag: entry.tag });
      notification.onclick = () => {
        window.focus();
        if (entry.route) window.location.hash = entry.route;
        notification.close();
      };
    } catch {
      // shortcut: Chrome on Android only allows service-worker notifications; tapping these does not route.
      void navigator.serviceWorker?.ready.then((sw) => sw.showNotification(entry.title, { body: entry.body, tag: entry.tag }));
    }
    for (const listener of listeners) listener(id);
  }

  function arm(id: string, entry: Entry) {
    const wait = entry.at.getTime() - Date.now();
    entry.timer =
      wait > MAX_DELAY ? setTimeout(() => arm(id, entry), MAX_DELAY) : setTimeout(() => show(id, entry), Math.max(wait, 0));
  }

  const service: NotificationService = {
    platform: 'web',
    firesWhenClosed: false,
    async checkPermission() {
      return permission();
    },
    async requestPermission() {
      if (permission() === 'prompt') await Notification.requestPermission();
      return permission();
    },
    async schedule(id: string, title: string, body: string, at: Date, options: ScheduleOptions = {}) {
      await service.cancel(id);
      // shortcut: sticky, actions and channel are Android-only; a browser shows a plain notification.
      const entry: Entry = { title, body, at, route: options.route, tag: options.slot ?? id };
      entries.set(id, entry);
      arm(id, entry);
    },
    async cancel(id) {
      clearTimeout(entries.get(id)?.timer);
      entries.delete(id);
    },
    async listPending() {
      return Array.from(entries, ([id, e]) => ({ id, title: e.title, body: e.body, at: e.at }));
    },
    async canScheduleExact() {
      return true;
    },
    async openExactAlarmSettings() {},
    onDelivered(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async takeEvents() {
      return [];
    },
  };
  return service;
}
