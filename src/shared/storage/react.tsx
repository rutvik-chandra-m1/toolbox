import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createDexieStorage } from './dexie';
import type { Collection, Entity, StorageBackend } from './types';

let defaultBackend: StorageBackend | undefined;

/** The app-wide backend (IndexedDB), created on first use. */
export function getDefaultStorage(): StorageBackend {
  defaultBackend ??= createDexieStorage();
  return defaultBackend;
}

const StorageContext = createContext<StorageBackend | null>(null);

/** Overrides the storage backend for a subtree (tests, or a future cloud backend). */
export function StorageProvider({
  backend,
  children,
}: {
  backend: StorageBackend;
  children: ReactNode;
}) {
  return <StorageContext.Provider value={backend}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageBackend {
  return useContext(StorageContext) ?? getDefaultStorage();
}

export interface CollectionState<T extends Entity> {
  /** Live contents; updates automatically after any write. */
  items: T[];
  /** True until the first read finishes. */
  loading: boolean;
  /** Set if reading failed (e.g. storage blocked by the browser). */
  error: unknown;
  /** For writes: put / remove / clear. */
  collection: Collection<T>;
}

/** Subscribes a component to one collection of one tool. */
export function useCollection<T extends Entity>(toolId: string, name: string): CollectionState<T> {
  const backend = useStorage();
  const collection = useMemo(() => backend.collection<T>(toolId, name), [backend, toolId, name]);
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: unknown }>({
    items: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    return collection.watch(
      (items) => setState({ items, loading: false, error: null }),
      (error) => setState((prev) => ({ ...prev, loading: false, error })),
    );
  }, [collection]);

  return { ...state, collection };
}
