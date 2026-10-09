import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDexieStorage, createMemoryStorage } from '@/shared/storage';
import { createTodoRepository } from './repository';
import type { Todo } from './types';

function setup() {
  let clock = 1_000;
  let nextId = 0;
  const collection = createMemoryStorage().collection<Todo>('todo', 'items');
  const repo = createTodoRepository(collection, {
    now: () => (clock += 10),
    newId: () => `id-${++nextId}`,
  });
  return { collection, repo };
}

describe('todo repository', () => {
  it('adds a validated, trimmed task and persists it', async () => {
    const { collection, repo } = setup();

    const added = await repo.add({ title: '  Write tests  ', priority: 'high', dueDate: '2026-10-09' });

    expect(added).toMatchObject({
      id: 'id-1',
      title: 'Write tests',
      priority: 'high',
      dueDate: '2026-10-09',
      completed: false,
    });
    expect(await collection.getAll()).toEqual([added]);
  });

  it('refuses invalid tasks with a readable message and stores nothing', async () => {
    const { collection, repo } = setup();

    await expect(repo.add({ title: '   ', priority: null, dueDate: null })).rejects.toThrow(
      'Please enter a task.',
    );
    await expect(repo.add({ title: 'x', priority: null, dueDate: '2026-02-30' })).rejects.toThrow(
      /due date/,
    );
    expect(await collection.getAll()).toEqual([]);
  });

  it('edits an existing task', async () => {
    const { collection, repo } = setup();
    const { id, createdAt } = await repo.add({ title: 'Old', priority: null, dueDate: null });

    await repo.update(id, { title: ' New ', priority: 'low', dueDate: '2026-11-01' });

    const stored = await collection.get(id);
    expect(stored).toMatchObject({ title: 'New', priority: 'low', dueDate: '2026-11-01', createdAt });
    expect(stored!.updatedAt).toBeGreaterThan(createdAt);
  });

  it('reports editing or completing a task that no longer exists', async () => {
    const { repo } = setup();
    const draft = { title: 'x', priority: null, dueDate: null };

    await expect(repo.update('ghost', draft)).rejects.toThrow('no longer exists');
    await expect(repo.setCompleted('ghost', true)).rejects.toThrow('no longer exists');
  });

  it('toggles completion on and off', async () => {
    const { collection, repo } = setup();
    const { id } = await repo.add({ title: 'Task', priority: null, dueDate: null });

    await repo.setCompleted(id, true);
    expect(await collection.get(id)).toMatchObject({ completed: true });
    expect((await collection.get(id))!.completedAt).not.toBeNull();

    await repo.setCompleted(id, false);
    expect(await collection.get(id)).toMatchObject({ completed: false, completedAt: null });
  });

  it('deletes a task', async () => {
    const { collection, repo } = setup();
    const a = await repo.add({ title: 'A', priority: null, dueDate: null });
    const b = await repo.add({ title: 'B', priority: null, dueDate: null });

    await repo.remove(a.id);

    expect((await collection.getAll()).map((t) => t.id)).toEqual([b.id]);
  });

  it('clears only completed tasks and reports how many', async () => {
    const { collection, repo } = setup();
    const a = await repo.add({ title: 'A', priority: null, dueDate: null });
    const b = await repo.add({ title: 'B', priority: null, dueDate: null });
    const c = await repo.add({ title: 'C', priority: null, dueDate: null });
    await repo.setCompleted(a.id, true);
    await repo.setCompleted(c.id, true);

    expect(await repo.clearCompleted()).toBe(2);
    expect((await collection.getAll()).map((t) => t.id)).toEqual([b.id]);
    expect(await repo.clearCompleted()).toBe(0);
  });
});

describe('todo data survives an app restart (real IndexedDB backend)', () => {
  it('reads back, in a fresh session, what an earlier session saved', async () => {
    const dbName = `todo-restart-${Math.random().toString(36).slice(2)}`;

    const session1 = createTodoRepository(createDexieStorage(dbName).collection<Todo>('todo', 'items'));
    const kept = await session1.add({ title: 'Remember me', priority: 'medium', dueDate: '2026-12-24' });
    const done = await session1.add({ title: 'Already done', priority: null, dueDate: null });
    await session1.setCompleted(done.id, true);

    // "Restart": nothing is shared with session 1 except the database itself.
    const reopened = createDexieStorage(dbName).collection<Todo>('todo', 'items');
    const stored = await reopened.getAll();

    expect(stored).toHaveLength(2);
    expect(stored.find((t) => t.id === kept.id)).toEqual(kept);
    expect(stored.find((t) => t.id === done.id)).toMatchObject({ completed: true });
  });
});
