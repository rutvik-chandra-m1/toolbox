import { lazy } from 'react';
import { describe, expect, it } from 'vitest';
import { defineRegistry, validateManifests, type ToolManifest } from './manifest';

const Icon = () => null;
const component = lazy(async () => ({ default: () => null }));

function tool(overrides: Partial<ToolManifest> = {}): ToolManifest {
  return {
    id: 'sample',
    name: 'Sample',
    description: 'A sample tool.',
    icon: Icon,
    route: '/sample',
    component,
    ...overrides,
  };
}

describe('validateManifests', () => {
  it('accepts well-formed, distinct tools (including nested routes)', () => {
    expect(() =>
      validateManifests([
        tool(),
        tool({ id: 'word-to-pdf', route: '/word-to-pdf' }),
        tool({ id: 'nested', route: '/converters/pdf' }),
      ]),
    ).not.toThrow();
  });

  it('rejects duplicate ids and duplicate routes', () => {
    expect(() => validateManifests([tool(), tool({ route: '/other' })])).toThrow(/duplicate id/);
    expect(() => validateManifests([tool(), tool({ id: 'other' })])).toThrow(/duplicate route/);
  });

  it.each(['Todo', 'to do', 'to_do', '-todo', 'todo-', '1todo', ''])('rejects the id %j', (id) => {
    expect(() => validateManifests([tool({ id })])).toThrow(/kebab-case/);
  });

  it.each(['/', 'todo', '/Todo', '/to do', '/todo/', '//todo'])('rejects the route %j', (route) => {
    expect(() => validateManifests([tool({ route })])).toThrow(/route/);
  });

  it('requires a name and a description', () => {
    expect(() => validateManifests([tool({ name: '  ' })])).toThrow(/name/);
    expect(() => validateManifests([tool({ description: '' })])).toThrow(/description/);
  });
});

describe('defineRegistry', () => {
  it('returns the same list when valid and throws when not', () => {
    const list = [tool()];
    expect(defineRegistry(list)).toBe(list);
    expect(() => defineRegistry([tool(), tool()])).toThrow();
  });
});
