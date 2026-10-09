import { CalendarDays, Check, Flag, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatISODate } from '@/shared/lib/dates';
import { IconButton } from '@/shared/ui';
import { formatDueLabel, getDueStatus, isOverdue } from '../logic';
import type { Priority, Todo } from '../types';

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  medium: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  low: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface TodoItemProps {
  todo: Todo;
  /** Today as local `YYYY-MM-DD`, used for the overdue / today / tomorrow labels. */
  today: string;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoItem({ todo, today, onToggle, onEdit, onDelete }: TodoItemProps) {
  const overdue = isOverdue(todo, today);
  const dueToday = !todo.completed && todo.dueDate !== null && getDueStatus(todo.dueDate, today) === 'today';

  return (
    <li className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white py-1 pr-1 pl-1 dark:border-slate-800 dark:bg-slate-900">
      <label className="relative flex size-12 shrink-0 cursor-pointer items-center justify-center">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo)}
          aria-label={todo.completed ? `Mark "${todo.title}" as not done` : `Mark "${todo.title}" as done`}
          className="peer sr-only"
        />
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full border-2 border-slate-400 text-transparent transition-colors dark:border-slate-500',
            'peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white',
            'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500',
          )}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden />
        </span>
      </label>

      <div className="min-w-0 flex-1 py-2">
        <p
          className={cn(
            'break-words',
            todo.completed && 'text-slate-500 line-through dark:text-slate-500',
          )}
        >
          {todo.title}
        </p>
        {(todo.priority || todo.dueDate) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {todo.priority && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                  PRIORITY_STYLES[todo.priority],
                )}
              >
                <Flag className="size-3.5" aria-hidden />
                {PRIORITY_LABELS[todo.priority]}
              </span>
            )}
            {todo.dueDate && (
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  overdue
                    ? 'font-medium text-red-700 dark:text-red-400'
                    : dueToday
                      ? 'font-medium text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-400',
                )}
              >
                <CalendarDays className="size-4" aria-hidden />
                {todo.completed ? formatISODate(todo.dueDate) : formatDueLabel(todo.dueDate, today)}
              </span>
            )}
          </div>
        )}
      </div>

      <IconButton label={`Edit "${todo.title}"`} onClick={() => onEdit(todo)}>
        <Pencil className="size-5" aria-hidden />
      </IconButton>
      <IconButton label={`Delete "${todo.title}"`} onClick={() => onDelete(todo)}>
        <Trash2 className="size-5" aria-hidden />
      </IconButton>
    </li>
  );
}
