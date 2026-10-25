import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, BellOff, Check, Info } from 'lucide-react';
import { Link } from 'react-router';
import { formatISODate } from '@/shared/lib/dates';
import type { NotificationPermission, NotificationService } from '@/shared/notifications';
import { Button } from '@/shared/ui';
import { lessonStatus } from './logic';
import { ROUTE, type Progress } from './types';

export const card =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`${card} ${className}`}>{children}</section>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-lg font-semibold text-accent-800 dark:text-accent-300">{children}</h3>;
}

/** Back link to the tool's home (the header's arrow leaves the tool altogether). */
export function BackLink({ to = ROUTE, children = 'Daily Read' }: { to?: string; children?: ReactNode }) {
  return (
    <Link
      to={to}
      className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent-700 hover:bg-accent-100 focus-visible:outline-2 focus-visible:outline-accent-500 dark:text-accent-300 dark:hover:bg-accent-950"
    >
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </Link>
  );
}

/** A link that looks like a button (48 px, like the shared Button). */
export function LinkButton({ to, children, primary = false }: { to: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${
        primary
          ? 'bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800'
          : 'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </Link>
  );
}

export function Banner({ tone, children }: { tone: 'warn' | 'info'; children: ReactNode }) {
  // Warnings are red here: amber is this tool's accent colour.
  const styles =
    tone === 'warn'
      ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

const badge = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium';

/** "Unread" / "Opened" / "Read on 5 Oct" (or "Completed today"). */
export function StatusBadge({ progress, today }: { progress: Progress | undefined; today: string }) {
  const status = lessonStatus(progress);
  if (status === 'read' && progress?.completedDate) {
    return (
      <span className={`${badge} bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200`}>
        <Check className="size-4" aria-hidden />
        {progress.completedDate === today ? 'Completed today' : `Read on ${formatISODate(progress.completedDate)}`}
      </span>
    );
  }
  return (
    <span className={`${badge} ${status === 'opened' ? 'bg-accent-100 text-accent-900 dark:bg-accent-950 dark:text-accent-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
      {status === 'opened' ? 'Opened' : 'Unread'}
    </span>
  );
}

/** Permission state for notifications, re-checked when the user comes back from the system settings. */
export function useNotificationState(notifications: NotificationService) {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [exactAllowed, setExactAllowed] = useState(true);

  const refresh = useCallback(async () => {
    setPermission(await notifications.checkPermission());
    setExactAllowed(await notifications.canScheduleExact());
  }, [notifications]);

  useEffect(() => {
    void refresh();
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  /** Asks the first time it is needed. */
  const ensurePermission = useCallback(async () => {
    let state = await notifications.checkPermission();
    if (state === 'prompt') state = await notifications.requestPermission();
    await refresh();
    return state;
  }, [notifications, refresh]);

  return { permission, exactAllowed, refresh, ensurePermission };
}

export function NotificationBanners({
  notifications,
  state,
}: {
  notifications: NotificationService;
  state: ReturnType<typeof useNotificationState>;
}) {
  const android = notifications.platform === 'android';
  return (
    <>
      {state.permission === 'unsupported' && (
        <Banner tone="warn">
          <p className="font-semibold">This browser can&apos;t show notifications.</p>
          <p className="mt-1">Use a current Chrome, Edge or Firefox, or the Android app.</p>
        </Banner>
      )}
      {state.permission === 'denied' && (
        <Banner tone="warn">
          <p className="flex items-center gap-2 font-semibold">
            <BellOff className="size-4" aria-hidden /> Notifications are blocked, so your daily lesson can&apos;t appear.
          </p>
          <p className="mt-1">
            {android
              ? 'Open Settings > Apps > Toolbox > Notifications and turn them on, then come back.'
              : 'Click the icon left of the address bar, set Notifications to Allow, then reload this page.'}
          </p>
          <Button className="mt-3" onClick={() => void state.ensurePermission()}>
            Try again
          </Button>
        </Banner>
      )}
      {state.permission === 'prompt' && (
        <Banner tone="info">
          <p className="font-semibold">Allow notifications to get your daily lesson.</p>
          <Button variant="primary" className="mt-3" onClick={() => void state.ensurePermission()}>
            Allow notifications
          </Button>
        </Banner>
      )}
      {android && !state.exactAllowed && (
        <Banner tone="warn">
          <p className="font-semibold">Your lesson may arrive a few minutes late.</p>
          <p className="mt-1">Allow &quot;Alarms &amp; reminders&quot; for Toolbox so it arrives at the exact minute.</p>
          <Button className="mt-3" onClick={() => void notifications.openExactAlarmSettings().then(state.refresh)}>
            Open setting
          </Button>
        </Banner>
      )}
      {!notifications.firesWhenClosed && (
        <Banner tone="info">
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            On a laptop the lesson notification only appears while this app is open. The Android app notifies even when
            closed, and keeps the notification until you act on it.
          </p>
        </Banner>
      )}
    </>
  );
}
