const SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * The key that namespaces a collection inside a backend. Both parts are
 * restricted so `("a", "b/c")` and `("a/b", "c")` can never map to the same key.
 */
export function collectionKey(toolId: string, name: string): string {
  for (const [label, value] of [
    ['tool id', toolId],
    ['collection name', name],
  ] as const) {
    if (!SEGMENT.test(value)) {
      throw new Error(`Invalid ${label} "${value}": use only letters, digits, "-" and "_".`);
    }
  }
  return `${toolId}/${name}`;
}
