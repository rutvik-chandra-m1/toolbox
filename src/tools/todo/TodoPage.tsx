import { useState } from 'react';
import { CircleCheckBig, ListChecks } from 'lucide-react';
import { todayISO } from '@/shared/lib/dates';
import { ConfirmDialog, Dialog, EmptyState, PageContainer, Spinner } from '@/shared/ui';
import { TodoForm } from './components/TodoForm';
import { TodoItem } from './components/TodoItem';
import { TodoToolbar } from './components/TodoToolbar';
import { countTodos, selectVisibleTodos } from './logic';
import type { Todo, TodoFilter, TodoSort } from './types';
import { useTodos } from './useTodos';

const EMPTY_MESSAGES: Record<Exclude<TodoFilter, 'all'>, { title: string; description: string }> = {
  active: { title: 'All caught up', description: 'No active tasks right now.' },
  completed: { title: 'Nothing completed yet', description: 'Finished tasks will show up here.' },
};

export default function TodoPage() {
  const { todos, loading, error, repo } = useTodos();
  const [filter, setFilter] = useState<TodoFilter>('all');
  const [sort, setSort] = useState<TodoSort>('created');
  const [editing, setEditing] = useState<Todo | null>(null);
  const [deleting, setDeleting] = useState<Todo | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const today = todayISO();
  const counts = countTodos(todos);
  const visible = selectVisibleTodos(todos, filter, sort);

  /** Runs a storage action; shows its failure in the banner instead of throwing. */
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <section
          aria-label="Add a task"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <TodoForm
            layout="inline"
            submitLabel="Add"
            resetOnSubmit
            onSubmit={async (draft) => {
              await repo.add(draft);
            }}
          />
        </section>

        {(error || actionError) && (
          <p
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100"
          >
            {actionError ?? "Couldn't read your tasks from storage. They may be blocked by the browser."}
          </p>
        )}

        {loading ? (
          <Spinner />
        ) : todos.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nothing to do yet"
            description="Add your first task above. It's saved on this device and works offline."
          />
        ) : (
          <>
            <TodoToolbar
              filter={filter}
              onFilterChange={setFilter}
              sort={sort}
              onSortChange={setSort}
              counts={counts}
              onClearCompleted={() => setConfirmingClear(true)}
            />

            {visible.length === 0 ? (
              <EmptyState
                icon={CircleCheckBig}
                {...EMPTY_MESSAGES[filter === 'all' ? 'active' : filter]}
              />
            ) : (
              <ul className="space-y-2">
                {visible.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    today={today}
                    onToggle={(t) => void run(() => repo.setCompleted(t.id, !t.completed))}
                    onEdit={setEditing}
                    onDelete={setDeleting}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit task">
        {editing && (
          <TodoForm
            layout="dialog"
            submitLabel="Save"
            autoFocus
            initial={{ title: editing.title, priority: editing.priority, dueDate: editing.dueDate }}
            onCancel={() => setEditing(null)}
            onSubmit={async (draft) => {
              await repo.update(editing.id, draft);
              setEditing(null);
            }}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this task?"
        message={deleting ? <>"{deleting.title}" will be permanently deleted.</> : null}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void run(() => repo.remove(target.id));
        }}
      />

      <ConfirmDialog
        open={confirmingClear}
        title="Clear completed tasks?"
        message={`${counts.completed} completed ${counts.completed === 1 ? 'task' : 'tasks'} will be permanently deleted. This can't be undone.`}
        confirmLabel="Clear completed"
        destructive
        onCancel={() => setConfirmingClear(false)}
        onConfirm={() => {
          setConfirmingClear(false);
          void run(() => repo.clearCompleted());
        }}
      />
    </PageContainer>
  );
}
