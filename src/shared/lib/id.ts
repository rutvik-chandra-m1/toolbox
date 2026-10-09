/**
 * Creates a unique id. `crypto.randomUUID` only exists in secure contexts
 * (https / localhost), so fall back to `getRandomValues` for e.g. a PWA opened
 * over a plain-http LAN address.
 */
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
