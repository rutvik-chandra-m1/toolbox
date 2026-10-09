import { createId } from '@/shared/lib/id';
import type { Collection } from '@/shared/storage';
import { createTodo, editTodo, setCompleted, validateDraft } from './logic';
import type { Todo, TodoDraft } from './types';

export interface TodoRepository {
  /** Validates and stores a new task. Throws an Error with a user-facing message if invalid. */
  add(draft: TodoDraft): Promise<Todo>;
  update(id: string, draft: TodoDraft): Promise<void>;
  setCompleted(id: string, completed: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  /** Deletes every completed task; resolves to how many were removed. */
  clearCompleted(): Promise<number>;
}

export interface RepositoryDeps {
  now?: () => number;
  newId?: () => string;
}

/** Todo operations on top of the generic storage `Collection` (no Dexie here). */
export function createTodoRepository(
  collection: Collection<Todo>,
  { now = Date.now, newId = createId }: RepositoryDeps = {},
): TodoRepository {
  async function require(id: string): Promise<Todo> {
    const todo = await collection.get(id);
    if (!todo) throw new Error('That task no longer exists.');
    return todo;
  }

  function validated(draft: TodoDraft): TodoDraft {
    const result = validateDraft(draft);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  return {
    async add(draft) {
      const todo = createTodo(validated(draft), newId(), now());
      await collection.put(todo);
      return todo;
    },
    async update(id, draft) {
      const todo = await require(id);
      await collection.put(editTodo(todo, validated(draft), now()));
    },
    async setCompleted(id, completed) {
      const todo = await require(id);
      const next = setCompleted(todo, completed, now());
      if (next !== todo) await collection.put(next);
    },
    async remove(id) {
      await collection.remove(id);
    },
    async clearCompleted() {
      const completedIds = (await collection.getAll()).filter((t) => t.completed).map((t) => t.id);
      if (completedIds.length > 0) await collection.removeMany(completedIds);
      return completedIds.length;
    },
  };
}
