import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, StorageBackend } from './types';

interface Note extends Entity {
  id: string;
  text: string;
  tags?: string[];
}

/**
 * Behaviour every StorageBackend must have. Run it against each backend so
 * they stay interchangeable (this is what makes a future cloud backend a
 * drop-in swap).
 */
export function describeStorageBackend(name: string, create: () => StorageBackend): void {
  describe(`${name} storage backend`, () => {
    let backend: StorageBackend;

    beforeEach(() => {
      backend = create();
    });

    it('starts empty', async () => {
      expect(await backend.collection<Note>('tool', 'notes').getAll()).toEqual([]);
    });

    it('stores and reads back records by id', async () => {
      const notes = backend.collection<Note>('tool', 'notes');
      await notes.put({ id: 'a', text: 'first', tags: ['x'] });
      await notes.put({ id: 'b', text: 'second' });

      expect(await notes.get('a')).toEqual({ id: 'a', text: 'first', tags: ['x'] });
      expect(await notes.get('missing')).toBeUndefined();
      const all = await notes.getAll();
      expect(all.map((n) => n.id).sort()).toEqual(['a', 'b']);
    });

    it('put replaces an existing record with the same id', async () => {
      const notes = backend.collection<Note>('tool', 'notes');
      await notes.put({ id: 'a', text: 'old' });
      await notes.put({ id: 'a', text: 'new' });

      expect(await notes.getAll()).toEqual([{ id: 'a', text: 'new' }]);
    });

    it('does not hand out references into its own storage', async () => {
      const notes = backend.collection<Note>('tool', 'notes');
      const original: Note = { id: 'a', text: 'safe', tags: ['x'] };
      await notes.put(original);
      original.text = 'mutated after put';
      original.tags?.push('y');

      const read = await notes.get('a');
      expect(read).toEqual({ id: 'a', text: 'safe', tags: ['x'] });
      if (read) read.text = 'mutated after get';
      expect((await notes.get('a'))?.text).toBe('safe');
    });

    it('removes one record, and removing an unknown id is not an error', async () => {
      const notes = backend.collection<Note>('tool', 'notes');
      await notes.put({ id: 'a', text: '1' });
      await notes.put({ id: 'b', text: '2' });

      await notes.remove('a');
      await expect(notes.remove('never-existed')).resolves.toBeUndefined();

      expect((await notes.getAll()).map((n) => n.id)).toEqual(['b']);
    });

    it('removeMany removes several records at once', async () => {
      const notes = backend.collection<Note>('tool', 'notes');
      for (const id of ['a', 'b', 'c', 'd']) await notes.put({ id, text: id });

      await notes.removeMany(['a', 'c', 'zzz']);
      await notes.removeMany([]);

      expect((await notes.getAll()).map((n) => n.id).sort()).toEqual(['b', 'd']);
    });

    it('clear empties only its own collection', async () => {
      const notes = backend.collection<Note>('tool', 'notes');
      const other = backend.collection<Note>('tool', 'other');
      await notes.put({ id: 'a', text: '1' });
      await other.put({ id: 'a', text: '2' });

      await notes.clear();

      expect(await notes.getAll()).toEqual([]);
      expect(await other.getAll()).toEqual([{ id: 'a', text: '2' }]);
    });

    it('isolates tools: the same collection name under another tool is a different collection', async () => {
      const mine = backend.collection<Note>('tool-a', 'items');
      const theirs = backend.collection<Note>('tool-b', 'items');
      await mine.put({ id: 'same-id', text: 'mine' });
      await theirs.put({ id: 'same-id', text: 'theirs' });

      expect(await mine.get('same-id')).toEqual({ id: 'same-id', text: 'mine' });
      expect(await theirs.get('same-id')).toEqual({ id: 'same-id', text: 'theirs' });

      await mine.clear();
      expect(await theirs.getAll()).toHaveLength(1);
    });

    it('rejects tool ids / collection names that could collide ("a"+"b/c" vs "a/b"+"c")', () => {
      expect(() => backend.collection<Note>('a', 'b/c')).toThrow(/Invalid collection name/);
      expect(() => backend.collection<Note>('a/b', 'c')).toThrow(/Invalid tool id/);
      expect(() => backend.collection<Note>('', 'c')).toThrow(/Invalid tool id/);
    });

    it('watch delivers the current contents, then every change, until unsubscribed', async () => {
      const notes = backend.collection<Note>('tool', 'notes');
      await notes.put({ id: 'a', text: '1' });

      const seen: string[][] = [];
      const stop = notes.watch((items) => seen.push(items.map((n) => n.id).sort()));
      await vi.waitFor(() => expect(seen.at(-1)).toEqual(['a']));

      await notes.put({ id: 'b', text: '2' });
      await vi.waitFor(() => expect(seen.at(-1)).toEqual(['a', 'b']));

      await notes.remove('a');
      await vi.waitFor(() => expect(seen.at(-1)).toEqual(['b']));

      stop();
      const countAfterStop = seen.length;
      await notes.put({ id: 'c', text: '3' });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(seen).toHaveLength(countAfterStop);
    });

    it("watch is not triggered by another collection's changes", async () => {
      const notes = backend.collection<Note>('tool', 'notes');
      const other = backend.collection<Note>('tool', 'other');
      const seen: number[] = [];
      const stop = notes.watch((items) => seen.push(items.length));
      await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));

      await other.put({ id: 'x', text: 'elsewhere' });
      await new Promise((resolve) => setTimeout(resolve, 50));
      stop();

      expect(seen.every((n) => n === 0)).toBe(true);
    });
  });
}
