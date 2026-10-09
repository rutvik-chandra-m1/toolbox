import { describe, expect, it } from 'vitest';
import {
  MAX_TITLE_LENGTH,
  countTodos,
  createTodo,
  editTodo,
  filterTodos,
  formatDueLabel,
  getDueStatus,
  isOverdue,
  selectVisibleTodos,
  setCompleted,
  sortTodos,
  validateDraft,
} from './logic';
import type { Todo, TodoDraft } from './types';

const T0 = 1_700_000_000_000;

function todo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    title: overrides.id,
    completed: false,
    priority: null,
    dueDate: null,
    createdAt: T0,
    updatedAt: T0,
    completedAt: null,
    ...overrides,
  };
}

const ids = (list: readonly Todo[]) => list.map((t) => t.id);

describe('validateDraft', () => {
  const draft = (over: Partial<TodoDraft> = {}): TodoDraft => ({
    title: 'Buy milk',
    priority: null,
    dueDate: null,
    ...over,
  });

  it('accepts a minimal draft and trims the title', () => {
    expect(validateDraft(draft({ title: '  Buy milk  ' }))).toEqual({
      ok: true,
      value: { title: 'Buy milk', priority: null, dueDate: null },
    });
  });

  it('keeps optional priority and due date', () => {
    const result = validateDraft(draft({ priority: 'high', dueDate: '2026-10-09' }));
    expect(result).toEqual({
      ok: true,
      value: { title: 'Buy milk', priority: 'high', dueDate: '2026-10-09' },
    });
  });

  it('rejects empty and whitespace-only titles', () => {
    expect(validateDraft(draft({ title: '' }))).toMatchObject({ ok: false });
    expect(validateDraft(draft({ title: '   \n\t ' }))).toMatchObject({ ok: false });
  });

  it('enforces the maximum title length (after trimming)', () => {
    expect(validateDraft(draft({ title: 'x'.repeat(MAX_TITLE_LENGTH) })).ok).toBe(true);
    expect(validateDraft(draft({ title: `${'x'.repeat(MAX_TITLE_LENGTH)}  ` })).ok).toBe(true);
    expect(validateDraft(draft({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1) })).ok).toBe(false);
  });

  it('rejects an impossible due date', () => {
    expect(validateDraft(draft({ dueDate: '2026-02-31' }))).toMatchObject({ ok: false });
    expect(validateDraft(draft({ dueDate: 'soon' }))).toMatchObject({ ok: false });
  });
});

describe('createTodo / editTodo / setCompleted', () => {
  it('creates an active todo stamped with the given id and time', () => {
    const created = createTodo({ title: 'A', priority: 'low', dueDate: '2026-10-09' }, 'id-1', T0);
    expect(created).toEqual({
      id: 'id-1',
      title: 'A',
      completed: false,
      priority: 'low',
      dueDate: '2026-10-09',
      createdAt: T0,
      updatedAt: T0,
      completedAt: null,
    });
  });

  it('edits the user fields, bumps updatedAt, and leaves the rest alone', () => {
    const original = todo({ id: 'a', completed: true, completedAt: T0 + 5, createdAt: T0 });
    const edited = editTodo(original, { title: 'New', priority: 'high', dueDate: null }, T0 + 100);

    expect(edited).toMatchObject({
      id: 'a',
      title: 'New',
      priority: 'high',
      dueDate: null,
      completed: true,
      completedAt: T0 + 5,
      createdAt: T0,
      updatedAt: T0 + 100,
    });
    expect(original.title).toBe('a'); // input untouched
  });

  it('marks complete and incomplete, tracking completedAt', () => {
    const active = todo({ id: 'a' });
    const done = setCompleted(active, true, T0 + 10);
    expect(done).toMatchObject({ completed: true, completedAt: T0 + 10, updatedAt: T0 + 10 });

    const undone = setCompleted(done, false, T0 + 20);
    expect(undone).toMatchObject({ completed: false, completedAt: null, updatedAt: T0 + 20 });
  });

  it('returns the very same object when nothing changes', () => {
    const active = todo({ id: 'a' });
    expect(setCompleted(active, false, T0 + 1)).toBe(active);
  });
});

describe('filterTodos / countTodos', () => {
  const list = [
    todo({ id: 'a' }),
    todo({ id: 'b', completed: true, completedAt: T0 }),
    todo({ id: 'c' }),
  ];

  it('filters all / active / completed', () => {
    expect(ids(filterTodos(list, 'all'))).toEqual(['a', 'b', 'c']);
    expect(ids(filterTodos(list, 'active'))).toEqual(['a', 'c']);
    expect(ids(filterTodos(list, 'completed'))).toEqual(['b']);
  });

  it('does not mutate or alias the input', () => {
    const result = filterTodos(list, 'all');
    expect(result).not.toBe(list);
    expect(list).toHaveLength(3);
  });

  it('counts per filter', () => {
    expect(countTodos(list)).toEqual({ all: 3, active: 2, completed: 1 });
    expect(countTodos([])).toEqual({ all: 0, active: 0, completed: 0 });
  });
});

describe('sortTodos', () => {
  it('"created": newest first', () => {
    const list = [
      todo({ id: 'old', createdAt: 1 }),
      todo({ id: 'new', createdAt: 3 }),
      todo({ id: 'mid', createdAt: 2 }),
    ];
    expect(ids(sortTodos(list, 'created'))).toEqual(['new', 'mid', 'old']);
  });

  it('"due": earliest first, undated last', () => {
    const list = [
      todo({ id: 'none' }),
      todo({ id: 'later', dueDate: '2026-12-01' }),
      todo({ id: 'sooner', dueDate: '2026-10-01' }),
      todo({ id: 'next-year', dueDate: '2027-01-01' }),
    ];
    expect(ids(sortTodos(list, 'due'))).toEqual(['sooner', 'later', 'next-year', 'none']);
  });

  it('"due": same date -> higher priority first, then newest', () => {
    const date = '2026-10-10';
    const list = [
      todo({ id: 'none-new', dueDate: date, createdAt: 9 }),
      todo({ id: 'low', dueDate: date, priority: 'low' }),
      todo({ id: 'high', dueDate: date, priority: 'high' }),
      todo({ id: 'medium', dueDate: date, priority: 'medium' }),
      todo({ id: 'none-old', dueDate: date, createdAt: 1 }),
    ];
    expect(ids(sortTodos(list, 'due'))).toEqual(['high', 'medium', 'low', 'none-new', 'none-old']);
  });

  it('puts completed tasks after active ones in either sort', () => {
    const list = [
      todo({ id: 'done-early', completed: true, dueDate: '2026-01-01', createdAt: 99 }),
      todo({ id: 'active-late', dueDate: '2026-12-31', createdAt: 1 }),
    ];
    expect(ids(sortTodos(list, 'due'))).toEqual(['active-late', 'done-early']);
    expect(ids(sortTodos(list, 'created'))).toEqual(['active-late', 'done-early']);
  });

  it('is deterministic for ties and does not mutate its input', () => {
    const list = [todo({ id: 'b' }), todo({ id: 'a' }), todo({ id: 'c' })];
    const snapshot = ids(list);
    expect(ids(sortTodos(list, 'created'))).toEqual(['a', 'b', 'c']);
    expect(ids(sortTodos([...list].reverse(), 'created'))).toEqual(['a', 'b', 'c']);
    expect(ids(list)).toEqual(snapshot);
  });

  it('selectVisibleTodos filters, then sorts', () => {
    const list = [
      todo({ id: 'a', dueDate: '2026-10-03' }),
      todo({ id: 'b', dueDate: '2026-10-01', completed: true }),
      todo({ id: 'c', dueDate: '2026-10-02' }),
    ];
    expect(ids(selectVisibleTodos(list, 'active', 'due'))).toEqual(['c', 'a']);
    expect(ids(selectVisibleTodos(list, 'completed', 'due'))).toEqual(['b']);
    expect(ids(selectVisibleTodos(list, 'all', 'due'))).toEqual(['c', 'a', 'b']);
  });
});

describe('due dates', () => {
  const today = '2026-10-09';

  it('classifies a due date relative to today', () => {
    expect(getDueStatus('2026-10-08', today)).toBe('overdue');
    expect(getDueStatus('2026-10-09', today)).toBe('today');
    expect(getDueStatus('2026-10-10', today)).toBe('tomorrow');
    expect(getDueStatus('2026-10-11', today)).toBe('upcoming');
  });

  it('handles "tomorrow" across month and year ends', () => {
    expect(getDueStatus('2026-11-01', '2026-10-31')).toBe('tomorrow');
    expect(getDueStatus('2027-01-01', '2026-12-31')).toBe('tomorrow');
  });

  it('only active tasks with a past due date are overdue', () => {
    expect(isOverdue(todo({ id: 'a', dueDate: '2026-10-08' }), today)).toBe(true);
    expect(isOverdue(todo({ id: 'a', dueDate: '2026-10-09' }), today)).toBe(false);
    expect(isOverdue(todo({ id: 'a', dueDate: null }), today)).toBe(false);
    expect(isOverdue(todo({ id: 'a', dueDate: '2026-10-08', completed: true }), today)).toBe(false);
  });

  it('formats friendly labels', () => {
    const options = { locale: 'en-US', referenceYear: 2026 };
    expect(formatDueLabel('2026-10-09', today, options)).toBe('Today');
    expect(formatDueLabel('2026-10-10', today, options)).toBe('Tomorrow');
    expect(formatDueLabel('2026-10-05', today, options)).toBe('Overdue · Mon, Oct 5');
    expect(formatDueLabel('2026-10-16', today, options)).toBe('Fri, Oct 16');
  });
});
