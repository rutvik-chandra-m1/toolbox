import { describe, expect, it } from 'vitest';
import { validateManifests } from '@/shared/tools';
import { tools } from './registry';

describe('tool registry', () => {
  it('is valid: unique ids and routes, every manifest field present', () => {
    expect(() => validateManifests(tools)).not.toThrow();
    for (const tool of tools) {
      expect(typeof tool.icon).toMatch(/function|object/);
      expect(tool.component).toBeTruthy();
    }
  });

  it('registers every tool folder under src/tools (folder name = tool id)', () => {
    const folders = Object.keys(import.meta.glob('./*/index.ts'))
      .map((path) => path.split('/')[1])
      .sort();

    expect(tools.map((tool) => tool.id).sort()).toEqual(folders);
  });
});
