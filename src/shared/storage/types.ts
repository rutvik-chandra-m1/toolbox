/**
 * The storage contract every tool codes against. Nothing outside
 * `src/shared/storage/` may import Dexie (or any other backend) - so swapping
 * IndexedDB for a cloud backend means writing one new `StorageBackend`, and no
 * tool code changes.
 *
 * Records must be plain structured-cloneable data (no functions/classes).
 * File-style data (Blobs) is storable too, which leaves room for tools that
 * work on files.
 */

/** Anything stored must carry a unique string id. */
export interface Entity {
  readonly id: string;
}

export type Unsubscribe = () => void;

/** A named group of records belonging to one tool (think: a table). */
export interface Collection<T extends Entity> {
  getAll(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  /** Insert or replace by id. */
  put(item: T): Promise<void>;
  /** Removing an id that does not exist is not an error. */
  remove(id: string): Promise<void>;
  removeMany(ids: readonly string[]): Promise<void>;
  /** Removes every record in this collection (and only this collection). */
  clear(): Promise<void>;
  /**
   * Calls `onChange` with the full current contents now and again after every
   * change (including ones made elsewhere, e.g. another tab). Returns an
   * unsubscribe function.
   */
  watch(onChange: (items: T[]) => void, onError?: (error: unknown) => void): Unsubscribe;
}

export interface StorageBackend {
  /**
   * Returns the collection `name` for tool `toolId`. Collections of different
   * tools never see each other's data, even if the names match.
   */
  collection<T extends Entity>(toolId: string, name: string): Collection<T>;
}
