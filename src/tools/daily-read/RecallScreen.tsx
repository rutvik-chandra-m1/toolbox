import { useRef, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { Button, EmptyState, Spinner } from '@/shared/ui';
import { dueRecallStates } from './logic';
import { BackLink, Card, LinkButton } from './parts';
import { ROUTE } from './types';
import type { DailyRead } from './useDailyRead';

interface Item {
  lessonId: string;
  lessonTitle: string;
  q: string;
  a: string;
  /** The last question of its lesson: the lesson's schedule is updated after it. */
  last: boolean;
}

function buildQueue({ recalls, lessonsById, today }: DailyRead): Item[] {
  return dueRecallStates(recalls.values(), today).flatMap((state) => {
    const lesson = lessonsById.get(state.id);
    return (lesson?.recall ?? []).map((r, i, all) => ({
      lessonId: state.id,
      lessonTitle: lesson?.title ?? '',
      q: r.q,
      a: r.a,
      last: i === all.length - 1,
    }));
  });
}

export function RecallScreen({ dr }: { dr: DailyRead }) {
  if (dr.loading) return <Spinner />;
  return <Session dr={dr} />;
}

/** Fixed list of what was due when the screen opened, so answering does not reshuffle it. */
function Session({ dr }: { dr: DailyRead }) {
  const [queue] = useState(() => buildQueue(dr));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [gotIt, setGotIt] = useState(0);
  const forgotten = useRef(new Set<string>());

  const item = queue[index];
  if (!item) {
    return (
      <>
        <BackLink />
        {queue.length === 0 ? (
          <EmptyState title="Nothing to recall right now" description="Finish a lesson and its quick recalls will show up after 3, 7 and 30 days." />
        ) : (
          <Card className="text-center">
            <PartyPopper className="mx-auto size-10 text-accent-600 dark:text-accent-400" aria-hidden />
            <h2 className="mt-2 text-xl font-semibold">All done</h2>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              You remembered {gotIt} of {queue.length}. Anything you forgot comes back in 3 days.
            </p>
            <div className="mt-4">
              <LinkButton primary to={ROUTE}>
                Back to Daily Read
              </LinkButton>
            </div>
          </Card>
        )}
      </>
    );
  }

  async function answer(remembered: boolean) {
    if (!item) return;
    if (!remembered) forgotten.current.add(item.lessonId);
    // "Forgot" on any question restarts the whole lesson's schedule from +3 days.
    if (item.last) await dr.repo.answerRecall(item.lessonId, !forgotten.current.has(item.lessonId));
    if (index === queue.length - 1) await dr.sync();
    if (remembered) setGotIt((n) => n + 1);
    setRevealed(false);
    setIndex(index + 1);
  }

  return (
    <div className="space-y-4">
      <BackLink />
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Question {index + 1} of {queue.length} · from &quot;{item.lessonTitle}&quot;
      </p>
      <Card>
        <h2 className="text-xl font-semibold">{item.q}</h2>
        {revealed ? (
          <p className="mt-4 rounded-xl border-l-4 border-accent-500 bg-accent-50 py-3 pr-3 pl-4 text-lg dark:bg-accent-950/40">{item.a}</p>
        ) : (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Try to answer from memory first.</p>
        )}
      </Card>
      {revealed ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="primary" onClick={() => void answer(true)}>
            Got it
          </Button>
          <Button onClick={() => void answer(false)}>Forgot</Button>
        </div>
      ) : (
        <Button variant="primary" className="w-full" onClick={() => setRevealed(true)}>
          Show answer
        </Button>
      )}
    </div>
  );
}
