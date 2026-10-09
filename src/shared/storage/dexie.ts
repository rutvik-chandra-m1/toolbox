import Dexie, { liveQuery, type Table } from 'dexie';
import { collectionKey } from './keys';
import type { Collection, Entity, StorageBackend } from './types';

/** One row per stored record. `data` is the tool's own object, stored untouched. */
interface RecordRow {
  collection: string; // "<toolId>/<name>"
  id: string;
  data: unknown;
}

class ToolboxDatabase extends Dexie {
  records!: Table<RecordRow, [string, string]>;

  constructor(name: string) {
    super(name);
    // A single generic table keyed by (collection, id): a new tool never needs
    // a schema change or a database migration.
    this.version(1).stores({ records: '[collection+id], collection' });
  }
}

/** IndexedDB backend (via Dexie). */
export function createDexieStorage(databaseName = 'toolbox'): StorageBackend {
  const db = new ToolboxDatabase(databaseName);

  return {
    collection<T extends Entity>(toolId: string, name: string): Collection<T> {
      const key = collectionKey(toolId, name);
      const readAll = async (): Promise<T[]> => {
        const rows = await db.records.where('collection').equals(key).toArray();
        return rows.map((row) => row.data as T);
      };

      return {
        getAll: readAll,
        async get(id) {
          const row = await db.records.get([key, id]);
          return row?.data as T | undefined;
        },
        async put(item) {
          await db.records.put({ collection: key, id: item.id, data: item });
        },
        async remove(id) {
          await db.records.delete([key, id]);
        },
        async removeMany(ids) {
          await db.records.bulkDelete(ids.map((id): [string, string] => [key, id]));
        },
        async clear() {
          await db.records.where('collection').equals(key).delete();
        },
        watch(onChange, onError) {
          // liveQuery re-runs the query whenever the underlying data changes,
          // including writes from other tabs.
          const subscription = liveQuery(readAll).subscribe({ next: onChange, error: onError });
          return () => subscription.unsubscribe();
        },
      };
    },
  };
}
