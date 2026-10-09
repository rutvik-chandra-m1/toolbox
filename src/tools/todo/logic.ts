import { addDays, formatISODate, isValidISODate } from '@/shared/lib/dates';
import type { DueStatus, Priority, Todo, TodoDraft, TodoFilter, TodoSort } from './types';

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export const MAX_TITLE_LENGTH = 200;

export type ValidationResult =
  | { ok: true; value: TodoDraft }
  | { ok: false; error: string };

/** Trims the title and checks every field; returns the cleaned draft or a user-facing error. */
export function validateDraft(draft: TodoDraft): ValidationResult {
  const title = draft.title.trim();
  if (!title) return { ok: false, error: 'Please enter a task.' };
  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_TITLE_LENGTH} characters.` };
  }
  if (draft.dueDate !== null && !isValidISODate(draft.dueDate)) {
    return { ok: false, error: 'That due date is not valid.' };
  }
  return { ok: true, value: { title, priority: draft.priority, dueDate: draft.dueDate } };
}

/* ------------------------------------------------------------------ */
/* Creating / changing todos (pure: callers supply id and clock)       */
/* ------------------------------------------------------------------ */

export function createTodo(draft: TodoDraft, id: string, now: number): Todo {
  return {
    id,
    title: draft.title,
    completed: false,
    priority: draft.priority,
    dueDate: draft.dueDate,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function editTodo(todo: Todo, draft: TodoDraft, now: number): Todo {
  return {
    ...todo,
    title: draft.title,
    priority: draft.priority,
    dueDate: draft.dueDate,
    updatedAt: now,
  };
}

export function setCompleted(todo: Todo, completed: boolean, now: number): Todo {
  if (todo.completed === completed) return todo;
  return { ...todo, completed, completedAt: completed ? now : null, updatedAt: now };
}

/* ------------------------------------------------------------------ */
/* Filtering and sorting                                               */
/* ------------------------------------------------------------------ */

export function filterTodos(todos: readonly Todo[], filter: TodoFilter): Todo[] {
  switch (filter) {
    case 'active':
      return todos.filter((t) => !t.completed);
    case 'completed':
      return todos.filter((t) => t.completed);
    case 'all':
      return [...todos];
  }
}

export function countTodos(todos: readonly Todo[]): Record<TodoFilter, number> {
  const completed = todos.filter((t) => t.completed).length;
  return { all: todos.length, active: todos.length - completed, completed };
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const NO_PRIORITY_RANK = 3;

function priorityRank(priority: Priority | null): number {
  return priority === null ? NO_PRIORITY_RANK : PRIORITY_RANK[priority];
}

function compareById(a: Todo, b: Todo): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Orders todos. Completed tasks always sink below active ones (it only
 * matters in the "all" view).
 *
 * - `created`: newest first.
 * - `due`: earliest due date first, tasks without a due date last; ties go to
 *   higher priority, then newest first.
 *
 * Every comparator ends in an id comparison, so the order is fully
 * deterministic.
 */
export function sortTodos(todos: readonly Todo[], sort: TodoSort): Todo[] {
  const byCreatedDesc = (a: Todo, b: Todo) => b.createdAt - a.createdAt || compareById(a, b);

  const byDue = (a: Todo, b: Todo) => {
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1; // ISO dates sort as strings
    }
    return priorityRank(a.priority) - priorityRank(b.priority) || byCreatedDesc(a, b);
  };

  const within = sort === 'due' ? byDue : byCreatedDesc;
  return [...todos].sort((a, b) => Number(a.completed) - Number(b.completed) || within(a, b));
}

/** What the list shows: filter first, then sort. */
export function selectVisibleTodos(
  todos: readonly Todo[],
  filter: TodoFilter,
  sort: TodoSort,
): Todo[] {
  return sortTodos(filterTodos(todos, filter), sort);
}

/* ------------------------------------------------------------------ */
/* Due dates                                                           */
/* ------------------------------------------------------------------ */

/** Relationship of a due date to today (both `YYYY-MM-DD`, local). */
export function getDueStatus(dueDate: string, today: string): DueStatus {
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate === addDays(today, 1)) return 'tomorrow';
  return 'upcoming';
}

/** A completed task is never overdue. */
export function isOverdue(todo: Todo, today: string): boolean {
  return !todo.completed && todo.dueDate !== null && todo.dueDate < today;
}

/** Short label for a due date: "Today", "Tomorrow", "Overdue · Mon, 5 Oct", "Fri, 9 Oct". */
export function formatDueLabel(
  dueDate: string,
  today: string,
  options: { locale?: string; referenceYear?: number } = {},
): string {
  const status = getDueStatus(dueDate, today);
  if (status === 'today') return 'Today';
  if (status === 'tomorrow') return 'Tomorrow';
  const formatted = formatISODate(dueDate, options);
  return status === 'overdue' ? `Overdue · ${formatted}` : formatted;
}
