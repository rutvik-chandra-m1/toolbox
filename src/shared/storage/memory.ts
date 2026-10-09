import { collectionKey } from './keys';
import type { Collection, Entity, StorageBackend } from './types';

/**
 * In-memory backend. Used by tests (and handy for a throwaway/"private" mode).
 * Data is lost on reload.
 */
export function createMemoryStorage(): StorageBackend {
  const stores = new Map<string, Map<string, unknown>>();
  const listeners = new Map<string, Set<() => void>>();

  function storeFor(key: string): Map<string, unknown> {
    let store = stores.get(key);
    if (!store) {
      store = new Map();
      stores.set(key, store);
    }
    return store;
  }

  function notify(key: string): void {
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
  }

  return {
    collection<T extends Entity>(toolId: string, name: string): Collection<T> {
      const key = collectionKey(toolId, name);
      const snapshot = (): T[] => [...storeFor(key).values()].map((v) => structuredClone(v) as T);

      return {
        async getAll() {
          return snapshot();
        },
        async get(id) {
          const found = storeFor(key).get(id);
          return found === undefined ? undefined : (structuredClone(found) as T);
        },
        async put(item) {
          storeFor(key).set(item.id, structuredClone(item));
          notify(key);
        },
        async remove(id) {
          storeFor(key).delete(id);
          notify(key);
        },
        async removeMany(ids) {
          for (const id of ids) storeFor(key).delete(id);
          notify(key);
        },
        async clear() {
          storeFor(key).clear();
          notify(key);
        },
        watch(onChange) {
          let active = true;
          const emit = () => {
            // Deliver asynchronously, like a real backend would.
            void Promise.resolve().then(() => {
              if (active) onChange(snapshot());
            });
          };
          let set = listeners.get(key);
          if (!set) {
            set = new Set();
            listeners.set(key, set);
          }
          const subscribers = set;
          subscribers.add(emit);
          emit();
          return () => {
            active = false;
            subscribers.delete(emit);
          };
        },
      };
    },
  };
}
