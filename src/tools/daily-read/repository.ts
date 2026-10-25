import { todayISO } from '@/shared/lib/dates';
import type { StorageBackend } from '@/shared/storage';
import { DEFAULT_SETTINGS, newRecallState } from './logic';
import { TOOL_ID, type PlanDay, type Progress, type RecallState, type Settings } from './types';

const blankProgress = (id: string): Progress => ({
  id,
  openedAt: null,
  lastOpenedDate: null,
  completedAt: null,
  completedDate: null,
  cycleDone: false,
  tryIt: null,
});

/** Everything Daily Read remembers, on this device only. Notifications are handled separately (scheduler.ts). */
export function createRepository(storage: StorageBackend, { now = Date.now }: { now?: () => number } = {}) {
  const settings = storage.collection<Settings>(TOOL_ID, 'settings');
  const progress = storage.collection<Progress>(TOOL_ID, 'progress');
  const plan = storage.collection<PlanDay>(TOOL_ID, 'plan');
  const recalls = storage.collection<RecallState>(TOOL_ID, 'recalls');
  const today = () => todayISO(new Date(now()));

  return {
    async readAll() {
      const [settingsDoc, progressDocs, planDocs, recallDocs] = await Promise.all([
        settings.get('main'),
        progress.getAll(),
        plan.getAll(),
        recalls.getAll(),
      ]);
      return {
        settings: settingsDoc ?? DEFAULT_SETTINGS,
        progress: new Map(progressDocs.map((p) => [p.id, p])),
        plan: new Map(planDocs.map((p) => [p.id, p])),
        recalls: new Map(recallDocs.map((r) => [r.id, r])),
      };
    },

    async saveSettings(patch: Partial<Omit<Settings, 'id'>>) {
      await settings.put({ ...((await settings.get('main')) ?? DEFAULT_SETTINGS), ...patch });
    },

    /** Opening a lesson (from the notification or the library) marks it Opened. */
    async open(lessonId: string) {
      const current = (await progress.get(lessonId)) ?? blankProgress(lessonId);
      await progress.put({ ...current, openedAt: current.openedAt ?? now(), lastOpenedDate: today() });
    },

    /**
     * Reaching the end of a lesson completes it: it leaves the unread pool, its recall schedule
     * starts (unless it already has one), and when the pool of `scopeIds` is used up it refills.
     */
    async complete(lessonId: string, scopeIds: readonly string[]) {
      const current = (await progress.get(lessonId)) ?? blankProgress(lessonId);
      const day = today();
      await progress.put({
        ...current,
        openedAt: current.openedAt ?? now(),
        lastOpenedDate: current.lastOpenedDate ?? day,
        completedAt: now(),
        completedDate: day,
        cycleDone: true,
      });
      if (!(await recalls.get(lessonId))) await recalls.put(newRecallState(lessonId, day));

      const all = new Map((await progress.getAll()).map((p) => [p.id, p]));
      if (scopeIds.every((id) => all.get(id)?.cycleDone)) {
        // Every lesson of the pool is done: the next cycle starts with all of them unread again.
        await Promise.all([...all.values()].filter((p) => scopeIds.includes(p.id)).map((p) => progress.put({ ...p, cycleDone: false })));
      }
    },

    async answerTryIt(lessonId: string, date: string, answer: 'yes' | 'not-yet') {
      const current = (await progress.get(lessonId)) ?? blankProgress(lessonId);
      await progress.put({ ...current, tryIt: { date, answer } });
    },

    /** Got it moves to the next review; Forgot starts the schedule over from +3 days. */
    async answerRecall(lessonId: string, remembered: boolean) {
      const state = await recalls.get(lessonId);
      if (!state) return;
      await recalls.put(remembered ? { ...state, stage: state.stage + 1 } : { id: lessonId, base: today(), stage: 0 });
    },

    /** "Not today" on a day's notification. */
    async skip(date: string) {
      const day = await plan.get(date);
      if (day) await plan.put({ ...day, skipped: true });
    },

    /** Stores `assigned` for `dates`; a date without a lesson (no books) loses its entry. Unchanged days are not rewritten. */
    async savePlan(assigned: ReadonlyMap<string, string>, dates: readonly string[], current: ReadonlyMap<string, PlanDay>) {
      for (const date of dates) {
        const lessonId = assigned.get(date);
        const old = current.get(date);
        if (lessonId === undefined) {
          if (old) await plan.remove(date);
        } else if (old?.lessonId !== lessonId) {
          await plan.put({ id: date, lessonId, skipped: false });
        }
      }
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
