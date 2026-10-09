import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { describeStorageBackend } from './collection-contract';
import { createDexieStorage } from './dexie';

let counter = 0;
const freshName = () => `toolbox-test-${++counter}-${Math.random().toString(36).slice(2)}`;

// Each test gets its own database so tests cannot see each other's data.
describeStorageBackend('Dexie (IndexedDB)', () => createDexieStorage(freshName()));

describe('Dexie persistence', () => {
  it('keeps data when the app restarts (a brand-new backend on the same database)', async () => {
    const name = freshName();

    const before = createDexieStorage(name).collection<{ id: string; text: string }>('tool', 'notes');
    await before.put({ id: 'a', text: 'survives a restart' });

    const afterRestart = createDexieStorage(name).collection<{ id: string; text: string }>(
      'tool',
      'notes',
    );
    expect(await afterRestart.getAll()).toEqual([{ id: 'a', text: 'survives a restart' }]);
  });

  it('keeps different databases separate', async () => {
    const a = createDexieStorage(freshName()).collection<{ id: string }>('tool', 'notes');
    const b = createDexieStorage(freshName()).collection<{ id: string }>('tool', 'notes');
    await a.put({ id: '1' });

    expect(await b.getAll()).toEqual([]);
  });
});
