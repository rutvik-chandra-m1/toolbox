import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Target } from 'lucide-react';
import { useParams } from 'react-router';
import { addDays } from '@/shared/lib/dates';
import { Button, EmptyState, Spinner } from '@/shared/ui';
import { linesOf, pickTryItCard } from './logic';
import { BackLink, Card, SectionTitle, StatusBadge } from './parts';
import type { DailyRead } from './useDailyRead';

const prose = 'whitespace-pre-line leading-relaxed text-slate-800 dark:text-slate-200';

function Section({ title, children }: { title: string; children: string }): ReactNode {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <p className={prose}>{children}</p>
    </section>
  );
}

export function LessonScreen({ dr }: { dr: DailyRead }) {
  const { lessonId = '' } = useParams();
  const { openLesson, completeLesson, lessonsById, progress, plan, today, repo } = dr;
  const lesson = lessonsById.get(lessonId);
  const lessonProgress = progress.get(lessonId);
  const endRef = useRef<HTMLDivElement>(null);
  const [answered, setAnswered] = useState(false);

  // Opening the lesson (from the notification, "Read now" or the library) marks it Opened and clears its notification.
  useEffect(() => {
    if (lesson) void openLesson(lesson.id);
  }, [lesson, openLesson]);

  // Scrolling to the end completes it (once a day).
  const completedToday = lessonProgress?.completedDate === today;
  const { loading } = dr;
  useEffect(() => {
    const end = endRef.current; // only rendered once the data has loaded
    if (loading || !lesson || !end || completedToday || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        void completeLesson(lesson.id);
      }
    });
    observer.observe(end);
    return () => observer.disconnect();
  }, [loading, lesson, completedToday, completeLesson]);

  if (dr.loading) return <Spinner />;
  if (!lesson) {
    return (
      <>
        <BackLink />
        <EmptyState title="Lesson not found" description="It may have been removed from the books." />
      </>
    );
  }

  const book = dr.books.find((b) => b.lessons.some((l) => l.id === lesson.id));
  // Only on today's lesson: yesterday's "try it today", if it has not been answered.
  const yesterdays = plan.get(today)?.lessonId === lesson.id ? pickTryItCard(progress.values(), lessonsById, today, lesson.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <BackLink />
        <h2 className="text-2xl font-bold">{lesson.title}</h2>
        {book && <p className="mt-1 text-slate-600 dark:text-slate-400">{book.title}</p>}
      </div>

      {yesterdays && !answered && (
        <Card className="border-accent-300 dark:border-accent-800">
          <p className="font-medium">Did you try yesterday&apos;s: {yesterdays.tryToday}?</p>
          <div className="mt-3 flex gap-3">
            {(['yes', 'not-yet'] as const).map((answer) => (
              <Button
                key={answer}
                variant={answer === 'yes' ? 'primary' : 'secondary'}
                className="flex-1"
                onClick={() => {
                  setAnswered(true);
                  void repo.answerTryIt(yesterdays.id, addDays(today, -1), answer);
                }}
              >
                {answer === 'yes' ? 'Yes' : 'Not yet'}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <Card className="border-accent-200 bg-accent-50/60 dark:border-accent-900 dark:bg-accent-950/30">
        <SectionTitle>The 30-second version</SectionTitle>
        <ul className="space-y-1.5">
          {linesOf(lesson.quick).map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      <section aria-label="Original text">
        <SectionTitle>Original text</SectionTitle>
        <blockquote className="rounded-r-xl border-l-4 border-accent-500 bg-slate-100 py-3 pr-4 pl-4 font-serif text-lg whitespace-pre-line text-slate-900 leading-relaxed dark:bg-slate-900 dark:text-slate-100">
          {lesson.original}
        </blockquote>
      </section>

      <Section title="Explanation">{lesson.explanation}</Section>
      <Section title="Real-world implications">{lesson.realWorld}</Section>
      <Section title="Extra thoughts">{lesson.extraThoughts}</Section>

      <Card className="border-accent-300 bg-accent-100/70 dark:border-accent-800 dark:bg-accent-950/50">
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            <Target className="size-5" aria-hidden /> Try it today
          </span>
        </SectionTitle>
        <p className="font-medium">{lesson.tryToday}</p>
      </Card>

      <div ref={endRef} aria-hidden className="h-px" />

      <Card>
        <h3 className="mb-2 text-lg font-semibold">Status</h3>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge progress={lessonProgress} today={today} />
          {!completedToday && (
            <span className="text-sm text-slate-600 dark:text-slate-400">Reaching the end of the lesson completes it.</span>
          )}
        </div>
        {completedToday && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Its quick recalls will come after 3, 7 and 30 days.
          </p>
        )}
      </Card>
    </div>
  );
}
