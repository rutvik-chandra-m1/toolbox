import { ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EmptyState, Spinner } from '@/shared/ui';
import { BackLink, StatusBadge, card } from './parts';
import { ROUTE, lessonRoute } from './types';
import type { DailyRead } from './useDailyRead';

const row = `${card} flex min-h-16 items-center gap-3 transition-colors hover:border-accent-400 focus-visible:outline-2 focus-visible:outline-accent-500 dark:hover:border-accent-500`;

/** The list of books. */
export function LibraryScreen({ dr }: { dr: DailyRead }) {
  if (dr.loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div>
        <BackLink />
        <h2 className="text-2xl font-bold">Library</h2>
      </div>
      {dr.books.length === 0 ? (
        <EmptyState title="No books yet" description="Add a book as described in content/daily-read/ADD_BOOK.md." />
      ) : (
        <ul className="space-y-3">
          {dr.books.map((book) => {
            const read = book.lessons.filter((l) => dr.progress.get(l.id)?.completedAt).length;
            return (
              <li key={book.slug}>
                <Link to={`${ROUTE}/library/${book.slug}`} className={row}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold">{book.title}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {read} of {book.lessons.length} lessons read
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One book's lessons, each with its status. Any lesson can be opened and reread. */
export function BookScreen({ dr }: { dr: DailyRead }) {
  const { slug } = useParams();
  if (dr.loading) return <Spinner />;
  const book = dr.books.find((b) => b.slug === slug);
  if (!book) {
    return (
      <>
        <BackLink to={`${ROUTE}/library`}>Library</BackLink>
        <EmptyState title="Book not found" />
      </>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <BackLink to={`${ROUTE}/library`}>Library</BackLink>
        <h2 className="text-2xl font-bold">{book.title}</h2>
      </div>
      <ul className="space-y-3">
        {book.lessons.map((lesson, i) => (
          <li key={lesson.id}>
            <Link to={lessonRoute(lesson.id)} className={row}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {i + 1}. {lesson.title}
                </span>
                <span className="mt-1 inline-block">
                  <StatusBadge progress={dr.progress.get(lesson.id)} today={dr.today} />
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
