import { useEffect, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { toISODate, todayISO } from '@/shared/lib/dates';
import { getNotificationService } from '@/shared/notifications';
import { useCollection } from '@/shared/storage';
import { Button, PageContainer, Segmented, Spinner } from '@/shared/ui';
import { formatClock, MODES, ROUTE, summarizeDay, TOOL_ID, type Mode, type Running, type Session } from './logic';

const NOTIFICATION_ID = 'focus-done';
const MODE_OPTIONS = (Object.keys(MODES) as Mode[]).map((value) => ({ value, label: MODES[value].label }));

export default function FocusPage() {
  const notifications = getNotificationService();
  const state = useCollection<Running>(TOOL_ID, 'state');
  const sessions = useCollection<Session>(TOOL_ID, 'sessions');
  const running = state.items[0];
  const [mode, setMode] = useState<Mode>('focus');
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  // Also runs when the page is opened after the timer ended elsewhere, so a finished session is never lost.
  useEffect(() => {
    if (!running || now < running.endAt) return;
    if (running.mode === 'focus') {
      void sessions.collection.put({
        id: String(running.endAt),
        date: toISODate(new Date(running.endAt)),
        minutes: MODES.focus.minutes,
      });
    }
    void state.collection.remove(running.id);
  }, [running, now, sessions.collection, state.collection]);

  async function start() {
    const endAt = Date.now() + MODES[mode].minutes * 60_000;
    await state.collection.put({ id: 'current', mode, endAt });
    try {
      let permission = await notifications.checkPermission();
      if (permission === 'prompt') permission = await notifications.requestPermission();
      if (permission === 'granted') {
        await notifications.schedule(NOTIFICATION_ID, MODES[mode].doneTitle, '', new Date(endAt), { route: ROUTE });
      }
    } catch (error) {
      console.error('Could not schedule the timer notification', error); // the timer still runs on screen
    }
  }

  function stop() {
    void state.collection.remove('current');
    void notifications.cancel(NOTIFICATION_ID).catch(() => undefined);
  }

  if (state.loading || sessions.loading) return <Spinner />;

  const shown = running?.mode ?? mode;
  const today = summarizeDay(sessions.items, todayISO());

  return (
    <PageContainer size="sm">
      <div className="space-y-6 text-center">
        {running ? (
          <p className="flex min-h-12 items-center justify-center text-lg font-medium">{MODES[shown].label}</p>
        ) : (
          <Segmented legend="Timer" value={mode} onChange={setMode} options={MODE_OPTIONS} />
        )}

        <p role="timer" className="text-7xl font-semibold tabular-nums sm:text-8xl">
          {formatClock(running ? running.endAt - now : MODES[mode].minutes * 60_000)}
        </p>

        {running ? (
          <Button variant="secondary" className="w-full" onClick={stop}>
            <Square className="size-5" aria-hidden /> Stop
          </Button>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => void start()}>
            <Play className="size-5" aria-hidden /> Start {MODES[mode].minutes} minutes
          </Button>
        )}

        <p role="status" className="text-slate-600 dark:text-slate-400">
          Today: {today.count} focus {today.count === 1 ? 'session' : 'sessions'} · {today.minutes} min
        </p>
        {!notifications.firesWhenClosed && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            On a laptop the notification only appears while this app is open. The timer itself keeps counting either way.
          </p>
        )}
      </div>
    </PageContainer>
  );
}
