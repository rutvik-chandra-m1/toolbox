import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './id';

describe('createId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a different id every time', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId()));
    expect(ids.size).toBe(500);
  });

  it('still works where crypto.randomUUID is unavailable (insecure contexts)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const id = createId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(createId()).not.toBe(id);
  });
});
