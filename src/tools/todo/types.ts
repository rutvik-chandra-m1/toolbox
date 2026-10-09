import type { Entity } from '@/shared/storage';

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const FILTERS = ['all', 'active', 'completed'] as const;
export type TodoFilter = (typeof FILTERS)[number];

export const SORTS = ['due', 'created'] as const;
export type TodoSort = (typeof SORTS)[number];

export interface Todo extends Entity {
  id: string;
  title: string;
  completed: boolean;
  /** `null` = no priority set. */
  priority: Priority | null;
  /** Local calendar date `YYYY-MM-DD`, or `null` = no due date. */
  dueDate: string | null;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
  /** When it was last marked complete; `null` while active. */
  completedAt: number | null;
}

/** The user-editable fields (what the add / edit form produces). */
export interface TodoDraft {
  title: string;
  priority: Priority | null;
  dueDate: string | null;
}

export type DueStatus = 'overdue' | 'today' | 'tomorrow' | 'upcoming';
