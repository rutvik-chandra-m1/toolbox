export { createDexieStorage } from './dexie';
export { createMemoryStorage } from './memory';
export { StorageProvider, getDefaultStorage, useCollection, useStorage } from './react';
export type { CollectionState } from './react';
export type { Collection, Entity, StorageBackend, Unsubscribe } from './types';

/**
 * Asks the browser not to evict our data under storage pressure. Best effort:
 * ignored where unsupported or denied.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // Not available (e.g. insecure context) - nothing to do.
  }
  return false;
}
