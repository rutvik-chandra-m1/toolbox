import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BellOff, BellRing, Clock, Info, Pencil, Trash2 } from 'lucide-react';
import { getNotificationService, type NotificationPermission } from '@/shared/notifications';
import { useCollection } from '@/shared/storage';
import { Button, ConfirmDialog, Dialog, EmptyState, IconButton, PageContainer, Spinner } from '@/shared/ui';
import { defaultDraft, formatWhen, pastStatus, splitReminders, toDraft } from './logic';
import { createReminderRepository } from './repository';
import { ReminderForm } from './ReminderForm';
import { COLLECTION, ROUTE, TOOL_ID, type Reminder } from './types';

const TEST_DELAY_MS = 10_000;

/** Re-renders every few seconds so reminders move from Upcoming to Past on their own. */
function useNow(intervalMs = 5_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function Banner({ tone, children }: { tone: 'warn' | 'info'; children: ReactNode }) {
  const styles =
    tone === 'warn'
      ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export default function NotifierPage() {
  const notifications = getNotificationService();
  const android = notifications.platform === 'android';
  const { items, loading, collection } = useCollection<Reminder>(TOOL_ID, COLLECTION);
  const repo = useMemo(() => createReminderRepository(collection, notifications), [collection, notifications]);
  const now = useNow();
  const { upcoming, past } = splitReminders(items, now);

  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [exactAllowed, setExactAllowed] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const refreshPermissions = useCallback(async () => {
    setPermission(await notifications.checkPermission());
    setExactAllowed(await notifications.canScheduleExact());
  }, [notifications]);

  // Re-check when coming back from the system settings.
  useEffect(() => {
    void refreshPermissions();
    const onVisible = () => document.visibilityState === 'visible' && void refreshPermissions();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshPermissions]);

  /** Asks for permission the first time it is needed (first save / test). */
  async function ensurePermission() {
    let state = await notifications.checkPermission();
    if (state === 'prompt') state = await notifications.requestPermission();
    setPermission(state);
    setExactAllowed(await notifications.canScheduleExact());
    return state;
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  async function sendTest() {
    await ensurePermission();
    await notifications.schedule(
      'notifier-test',
      'This is a test notification from Toolbox.',
      '',
      new Date(Date.now() + TEST_DELAY_MS),
      { route: ROUTE },
    );
    setNotice(
      android
        ? 'Test notification in 10 seconds. You can close the app or lock the phone now.'
        : 'Test notification in 10 seconds. Keep this app open.',
    );
  }

  const blocked = permission === 'denied' || permission === 'unsupported';

  return (
    <PageContainer>
      <div className="space-y-5">
        {permission === 'unsupported' && (
          <Banner tone="warn">
            <p className="font-semibold">This browser can&apos;t show notifications.</p>
            <p className="mt-1">Use a current Chrome, Edge or Firefox, or the Android app.</p>
          </Banner>
        )}
        {permission === 'denied' && (
          <Banner tone="warn">
            <p className="flex items-center gap-2 font-semibold">
              <BellOff className="size-4" aria-hidden /> Notifications are blocked, so reminders can&apos;t appear.
            </p>
            <p className="mt-1">
              {android
                ? 'Open Settings > Apps > Toolbox > Notifications and turn them on, then come back.'
                : 'Click the icon left of the address bar, set Notifications to Allow, then reload this page.'}
            </p>
            <Button className="mt-3" onClick={() => void ensurePermission().then(refreshPermissions)}>
              Try again
            </Button>
          </Banner>
        )}
        {android && !exactAllowed && (
          <Banner tone="warn">
            <p className="font-semibold">Reminders may arrive a few minutes late.</p>
            <p className="mt-1">Allow &quot;Alarms &amp; reminders&quot; for Toolbox so they fire at the exact minute.</p>
            <Button className="mt-3" onClick={() => void notifications.openExactAlarmSettings().then(refreshPermissions)}>
              Open setting
            </Button>
          </Banner>
        )}
        {!notifications.firesWhenClosed && (
          <Banner tone="info">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              On a laptop, reminders only appear while this app is open (a browser tab or the installed app). Ones that
              come due while it is closed are listed as Missed. The Android app notifies even when closed.
            </p>
          </Banner>
        )}

        <section
          aria-label="New reminder"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <ReminderForm
            initial={defaultDraft(now)}
            submitLabel="Save reminder"
            resetOnSubmit
            onSubmit={async (draft) => {
              await ensurePermission();
              await repo.add(draft);
              setNotice(null);
            }}
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={blocked} onClick={() => void run(sendTest)}>
            <BellRing className="size-5" aria-hidden /> Test notification
          </Button>
          {notice && (
            <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
              {notice}
            </p>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState icon={Clock} title="No reminders yet" description="Type a message, pick a time and save it." />
        ) : (
          <>
            <ReminderList title="Upcoming" reminders={upcoming} empty="Nothing scheduled.">
              {(r) => (
                <ReminderRow key={r.id} reminder={r} now={now} onEdit={setEditing} onDelete={setDeleting} />
              )}
            </ReminderList>
            <ReminderList
              title="Past"
              reminders={past}
              empty="Nothing yet."
              action={
                past.length > 0 && (
                  <Button variant="ghost" onClick={() => setConfirmingClear(true)}>
                    <Trash2 className="size-5" aria-hidden /> Clear past reminders
                  </Button>
                )
              }
            >
              {(r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  now={now}
                  status={pastStatus(r, notifications.firesWhenClosed)}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              )}
            </ReminderList>
          </>
        )}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit reminder">
        {editing && (
          <ReminderForm
            initial={toDraft(editing)}
            submitLabel="Save"
            onCancel={() => setEditing(null)}
            onSubmit={async (draft) => {
              await ensurePermission();
              await repo.update(editing.id, draft);
              setEditing(null);
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this reminder?"
        message={deleting ? `"${deleting.message}" will be deleted and won't notify you.` : null}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void run(() => repo.remove(target.id));
        }}
      />

      <ConfirmDialog
        open={confirmingClear}
        title="Clear past reminders?"
        message={`${past.length} past ${past.length === 1 ? 'reminder' : 'reminders'} will be deleted. This can't be undone.`}
        confirmLabel="Clear"
        destructive
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => {
          setConfirmingClear(false);
          void run(() => repo.clearPast());
        }}
      />
    </PageContainer>
  );
}

function ReminderList({
  title,
  reminders,
  empty,
  action,
  children,
}: {
  title: string;
  reminders: Reminder[];
  empty: string;
  action?: ReactNode;
  children: (reminder: Reminder) => ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex min-h-12 items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {title} <span className="font-normal text-slate-500">({reminders.length})</span>
        </h2>
        {action}
      </div>
      {reminders.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">{reminders.map(children)}</ul>
      )}
    </section>
  );
}

function ReminderRow({
  reminder,
  now,
  status,
  onEdit,
  onDelete,
}: {
  reminder: Reminder;
  now: number;
  status?: 'Sent' | 'Missed';
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  return (
    <li className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white py-1 pr-1 pl-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0 flex-1 py-2">
        <p className="break-words whitespace-pre-wrap">{reminder.message}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden />
            {formatWhen(reminder.at, now)}
          </span>
          {status && (
            <span
              className={
                status === 'Missed'
                  ? 'rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                  : 'rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-900 dark:bg-green-950 dark:text-green-200'
              }
            >
              {status}
            </span>
          )}
        </p>
      </div>
      <IconButton label={`Edit "${reminder.message}"`} onClick={() => onEdit(reminder)}>
        <Pencil className="size-5" aria-hidden />
      </IconButton>
      <IconButton label={`Delete "${reminder.message}"`} onClick={() => onDelete(reminder)}>
        <Trash2 className="size-5" aria-hidden />
      </IconButton>
    </li>
  );
}
