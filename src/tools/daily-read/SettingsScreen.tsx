import { useState, type FormEvent } from 'react';
import { BellRing } from 'lucide-react';
import { Button, Field, Input, Segmented, Select, Spinner } from '@/shared/ui';
import { formatTime, isTime, lessonsInScope } from './logic';
import { BackLink, Card, NotificationBanners, useNotificationState } from './parts';
import { scheduleTestNotification } from './scheduler';
import type { Settings } from './types';
import type { DailyRead } from './useDailyRead';

export function SettingsScreen({ dr }: { dr: DailyRead }) {
  if (dr.loading) return <Spinner />;
  return <SettingsForm dr={dr} />;
}

function SettingsForm({ dr }: { dr: DailyRead }) {
  const { settings, books, notifications } = dr;
  const [time, setTime] = useState(settings.time);
  const [recallTime, setRecallTime] = useState(settings.recallTime);
  const [mode, setMode] = useState<'all' | 'one'>(settings.bookSlug ? 'one' : 'all');
  const [slug, setSlug] = useState(settings.bookSlug ?? books[0]?.slug ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notificationState = useNotificationState(notifications);

  async function save(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!isTime(time) || !isTime(recallTime)) {
      setError('Please pick both times.');
      return;
    }
    setError(null);
    const patch: Pick<Settings, 'time' | 'recallTime' | 'bookSlug'> = {
      time,
      recallTime,
      bookSlug: mode === 'one' && slug ? slug : null,
    };
    await dr.repo.saveSettings(patch);
    await notificationState.ensurePermission();
    await dr.sync();
    setNotice(`Saved. Your lesson arrives at ${formatTime(time)} and recalls at ${formatTime(recallTime)}.`);
  }

  async function sendTest() {
    const state = await notificationState.ensurePermission();
    const lesson = lessonsInScope(books, settings.bookSlug)[0];
    if (!lesson || state !== 'granted') {
      setNotice(state === 'granted' ? 'There is no lesson to send.' : 'Allow notifications first.');
      return;
    }
    await scheduleTestNotification(notifications, lesson);
    setNotice(
      notifications.firesWhenClosed
        ? 'A test lesson notification arrives in 1 minute. You can close the app or lock the phone now.'
        : 'A test lesson notification arrives in 1 minute. Keep this app open.',
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <BackLink />
        <h2 className="text-2xl font-bold">Settings</h2>
      </div>

      <NotificationBanners notifications={notifications} state={notificationState} />

      <Card>
        <form onSubmit={(event) => void save(event)} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily lesson time">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Recall time">
              <Input type="time" value={recallTime} onChange={(e) => setRecallTime(e.target.value)} />
            </Field>
          </div>
          <p className="-mt-2 text-sm text-slate-600 dark:text-slate-400">
            You get one lesson a day at the first time. At the second time, if any quick recalls are due, you get one
            notification for them.
          </p>

          <div className="space-y-3">
            <Segmented
              legend="Books to use"
              showLegend
              value={mode}
              onChange={setMode}
              options={[
                { value: 'all', label: 'All books mixed' },
                { value: 'one', label: 'One book' },
              ]}
            />
            {mode === 'one' && (
              <Field label="Book" hideLabel>
                <Select value={slug} onChange={(e) => setSlug(e.target.value)}>
                  {books.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full">
            Save settings
          </Button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void sendTest()}>
          <BellRing className="size-5" aria-hidden /> Send a test in 1 minute
        </Button>
        {notice && (
          <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
