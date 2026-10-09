import { useMemo } from 'react';
import { useCollection } from '@/shared/storage';
import { ITEMS_COLLECTION, TOOL_ID } from './constants';
import { createTodoRepository, type TodoRepository } from './repository';
import type { Todo } from './types';

export interface UseTodos {
  /** Live list of every task (unsorted, unfiltered). */
  todos: Todo[];
  loading: boolean;
  error: unknown;
  repo: TodoRepository;
}

export function useTodos(): UseTodos {
  const { items, loading, error, collection } = useCollection<Todo>(TOOL_ID, ITEMS_COLLECTION);
  const repo = useMemo(() => createTodoRepository(collection), [collection]);
  return { todos: items, loading, error, repo };
}
