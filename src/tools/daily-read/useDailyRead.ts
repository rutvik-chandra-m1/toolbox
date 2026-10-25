import { useCallback, useEffect, useMemo } from 'react';
import { todayISO } from '@/shared/lib/dates';
import { getNotificationService } from '@/shared/notifications';
import { useCollection, useStorage } from '@/shared/storage';
import { catalog } from './content';
import { DEFAULT_SETTINGS, lessonsInScope, lessonsOf } from './logic';
import { createRepository } from './repository';
import { clearShownLessonNotification, syncSchedule } from './scheduler';
import { TOOL_ID, type PlanDay, type Progress, type RecallState, type Settings } from './types';

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

/** Everything the Daily Read screens need: live data, plus actions that keep the notifications in step. */
export function useDailyRead(books = catalog) {
  const storage = useStorage();
  const notifications = getNotificationService();
  const repo = useMemo(() => createRepository(storage), [storage]);
  const settingsState = useCollection<Settings>(TOOL_ID, 'settings');
  const progressState = useCollection<Progress>(TOOL_ID, 'progress');
  const planState = useCollection<PlanDay>(TOOL_ID, 'plan');
  const recallState = useCollection<RecallState>(TOOL_ID, 'recalls');

  const settings = settingsState.items.find((s) => s.id === 'main') ?? DEFAULT_SETTINGS;
  const lessons = useMemo(() => lessonsOf(books), [books]);
  const lessonsById = useMemo(() => byId(lessons), [lessons]);
  const deps = useMemo(() => ({ repo, books, notifications }), [repo, books, notifications]);

  const sync = useCallback(() => syncSchedule(deps), [deps]);
  // Opening the tool also brings the plan and notifications up to date (the app-start sync may still be running; calls queue).
  useEffect(() => {
    sync().catch((error: unknown) => console.error('Daily Read could not refresh its schedule', error));
  }, [sync]);

  const openLesson = useCallback(
    async (lessonId: string) => {
      await repo.open(lessonId);
      await clearShownLessonNotification(deps, lessonId);
    },
    [repo, deps],
  );

  const completeLesson = useCallback(
    async (lessonId: string) => {
      const { settings: current } = await repo.readAll();
      await repo.complete(
        lessonId,
        lessonsInScope(books, current.bookSlug).map((l) => l.id),
      );
      await clearShownLessonNotification(deps, lessonId);
      await sync();
    },
    [repo, books, deps, sync],
  );

  return {
    loading: settingsState.loading || progressState.loading || planState.loading || recallState.loading,
    books,
    lessons,
    lessonsById,
    settings,
    progress: byId(progressState.items),
    plan: byId(planState.items),
    recalls: byId(recallState.items),
    today: todayISO(),
    notifications,
    repo,
    sync,
    openLesson,
    completeLesson,
  };
}

export type DailyRead = ReturnType<typeof useDailyRead>;
