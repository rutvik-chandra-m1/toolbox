import { useEffect } from 'react';
import { BookOpen, Check, Library, RotateCcw, Settings as SettingsIcon } from 'lucide-react';
import { Spinner } from '@/shared/ui';
import { usingSample } from './content';
import { dueRecallStates, formatTime, recallQuestionsDue } from './logic';
import { Banner, Card, LinkButton, NotificationBanners, StatusBadge, useNotificationState } from './parts';
import { RECALL_ROUTE, ROUTE, lessonRoute } from './types';
import type { DailyRead } from './useDailyRead';

export function HomeScreen({ dr }: { dr: DailyRead }) {
  const { notifications, plan, progress, settings, today, lessonsById, recalls } = dr;
  const notificationState = useNotificationState(notifications);
  const { permission, ensurePermission } = notificationState;

  // The first visit asks for permission (the system dialog on Android 13+).
  useEffect(() => {
    if (permission === 'prompt') void ensurePermission();
  }, [permission, ensurePermission]);

  if (dr.loading) return <Spinner />;

  const todayDay = plan.get(today);
  const lesson = todayDay ? lessonsById.get(todayDay.lessonId) : undefined;
  const lessonProgress = lesson ? progress.get(lesson.id) : undefined;
  const dueCount = recallQuestionsDue(recalls.values(), lessonsById, today);
  const dueLessons = dueRecallStates(recalls.values(), today).length;
  // Finished today but not today's planned lesson (for example read early, or from the library).
  const doneToday = [...progress.values()]
    .filter((p) => p.completedDate === today && p.id !== lesson?.id)
    .flatMap((p) => lessonsById.get(p.id) ?? []);

  return (
    <div className="space-y-5">
      <NotificationBanners notifications={notifications} state={notificationState} />

      {usingSample && (
        <Banner tone="info">
          These are <strong>sample lessons</strong>. Your own books are added at build time (see
          content/daily-read/ADD_BOOK.md); once one exists the samples are no longer used.
        </Banner>
      )}

      <Card className="border-accent-200 bg-accent-50/60 dark:border-accent-900 dark:bg-accent-950/30">
        <p className="text-sm font-semibold tracking-wide text-accent-700 uppercase dark:text-accent-300">Today&apos;s lesson</p>
        {lesson ? (
          <>
            <h2 className="mt-1 text-xl font-semibold">{lesson.title}</h2>
            <p className="mt-1 text-slate-600 dark:text-slate-400">{lesson.hook}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge progress={lessonProgress} today={today} />
              {todayDay?.skipped && (
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Skipped with &quot;Not today&quot;. It is back in the unread pool.
                </span>
              )}
            </div>
            <div className="mt-4">
              <LinkButton primary to={lessonRoute(lesson.id)}>
                <BookOpen className="size-5" aria-hidden /> {lessonProgress?.completedDate ? 'Read again' : 'Read now'}
              </LinkButton>
            </div>
          </>
        ) : (
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            No lesson yet. Open the library to read one, or check back after the app has set up today&apos;s lesson.
          </p>
        )}
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          A new lesson arrives every day at {formatTime(settings.time)}.
        </p>
      </Card>

      {doneToday.length > 0 && (
        <Card>
          <ul className="space-y-1">
            {doneToday.map((l) => (
              <li key={l.id} className="flex items-start gap-2 font-medium text-green-800 dark:text-green-300">
                <Check className="mt-1 size-4 shrink-0" aria-hidden />
                <span>
                  Completed today: <span className="font-normal text-slate-700 dark:text-slate-300">{l.title}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dueCount > 0 && (
        <Card>
          <h2 className="text-lg font-semibold">
            {dueCount} quick {dueCount === 1 ? 'recall' : 'recalls'} due
          </h2>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            From {dueLessons} {dueLessons === 1 ? 'lesson' : 'lessons'} you finished. Answer from memory, then check.
          </p>
          <div className="mt-4">
            <LinkButton primary to={RECALL_ROUTE}>
              <RotateCcw className="size-5" aria-hidden /> Start recalls
            </LinkButton>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <LinkButton to={`${ROUTE}/library`}>
          <Library className="size-5" aria-hidden /> Library
        </LinkButton>
        <LinkButton to={`${ROUTE}/settings`}>
          <SettingsIcon className="size-5" aria-hidden /> Settings
        </LinkButton>
      </div>
    </div>
  );
}
