import { describe, expect, it } from 'vitest';

/**
 * Enforces the layering rules from docs/ARCHITECTURE.md by reading every source file's
 * imports. If a rule is broken, this test names the file and the import.
 *
 *  1. src/shared  never imports src/app or src/tools.
 *  2. A tool      never imports another tool, the registry, or src/app.
 *  3. src/app     reaches into src/tools only through src/tools/registry.
 *  4. Only src/shared/storage imports Dexie, and everyone else imports the
 *     storage barrel (`@/shared/storage`), never its backend files.
 */

type Files = Record<string, string>;

const IMPORT_PATTERNS = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from '...' / export * from '...'
  /\bimport\s*['"]([^'"]+)['"]/g, // import '...'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // import('...')
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function importsOf(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) found.push(match[1] as string);
  }
  return found;
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/** Resolves an import to a project path like "src/tools/todo/logic", or null for a package. */
function resolveImport(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return `src/${specifier.slice(2)}`;
  if (specifier.startsWith('.')) {
    const dir = fromFile.split('/').slice(0, -1).join('/');
    return normalize(`${dir}/${specifier}`);
  }
  return null;
}

const isRegistry = (path: string) => path === 'src/tools/registry' || path.startsWith('src/tools/registry.');
const toolOf = (path: string) => (isRegistry(path) ? null : (/^src\/tools\/([^/]+)\//.exec(path)?.[1] ?? null));

function findViolations(files: Files): string[] {
  const violations: string[] = [];

  for (const [file, source] of Object.entries(files)) {
    const fileTool = toolOf(file);
    const inShared = file.startsWith('src/shared/');
    const inApp = file.startsWith('src/app/');
    const inStorage = file.startsWith('src/shared/storage/');

    for (const specifier of importsOf(source)) {
      const target = resolveImport(file, specifier);
      const report = (rule: string) => violations.push(`${file} imports "${specifier}": ${rule}`);

      if (target === null) {
        if (!inStorage && (specifier === 'dexie' || specifier.startsWith('dexie/'))) {
          report('only src/shared/storage may use Dexie (go through the storage interface)');
        }
        continue;
      }

      const targetTool = toolOf(target);
      const targetIsTools = target.startsWith('src/tools/');
      const targetIsApp = target.startsWith('src/app/');

      if (inShared && (targetIsTools || targetIsApp)) {
        report('src/shared must not depend on src/app or src/tools');
      }
      if (fileTool !== null) {
        if (targetTool !== null && targetTool !== fileTool) {
          report(`tool "${fileTool}" must not import tool "${targetTool}" (tools never import each other)`);
        }
        if (isRegistry(target)) report('tools must not import the registry');
        if (targetIsApp) report('tools must not import the app shell');
      }
      if (inApp && targetIsTools && !isRegistry(target)) {
        report('the shell may only import src/tools/registry, never an individual tool');
      }
      if (!inStorage && /^src\/shared\/storage\/.+/.test(target)) {
        report('import the storage barrel "@/shared/storage", not its internal files');
      }
    }
  }
  return violations;
}

const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Files;

const projectFiles: Files = Object.fromEntries(
  Object.entries(sources)
    .map(([path, source]) => [path.replace(/^\//, ''), source] as const)
    .filter(([path]) => path !== 'src/architecture.test.ts'),
);

describe('architecture rules', () => {
  it('scans the real source tree', () => {
    expect(Object.keys(projectFiles).length).toBeGreaterThan(30);
    expect(Object.keys(projectFiles)).toContain('src/tools/registry.ts');
  });

  it('are respected by every file in the project', () => {
    expect(findViolations(projectFiles)).toEqual([]);
  });
});

describe('the rule checker itself', () => {
  const clean: Files = {
    'src/tools/a/index.ts': `import { x } from './logic'; import { y } from '@/shared/lib/y';`,
    'src/tools/a/logic.ts': `export const x = 1;`,
    'src/app/App.tsx': `import { tools } from '@/tools/registry';`,
    'src/shared/lib/y.ts': `export const y = 1;`,
    'src/shared/storage/dexie.ts': `import Dexie from 'dexie';`,
  };

  it('passes a clean tree', () => {
    expect(findViolations(clean)).toEqual([]);
  });

  it('catches a tool importing another tool (alias and relative forms)', () => {
    const alias = findViolations({ ...clean, 'src/tools/b/index.ts': `import { x } from '@/tools/a/logic';` });
    const relative = findViolations({ ...clean, 'src/tools/b/index.ts': `import { x } from '../a/logic';` });
    expect(alias).toHaveLength(1);
    expect(relative).toHaveLength(1);
    expect(alias[0]).toContain('never import each other');
  });

  it('catches lazy / re-export / side-effect imports too', () => {
    for (const code of [
      `const m = () => import('@/tools/a/logic');`,
      `export * from '@/tools/a/logic';`,
      `export { x } from '../a/logic';`,
      `import '@/tools/a/logic';`,
    ]) {
      expect(findViolations({ ...clean, 'src/tools/b/index.ts': code })).toHaveLength(1);
    }
  });

  it('catches shared depending on a tool or the app', () => {
    expect(findViolations({ ...clean, 'src/shared/lib/z.ts': `import { x } from '@/tools/a/logic';` })).toHaveLength(1);
    expect(findViolations({ ...clean, 'src/shared/lib/z.ts': `import { App } from '@/app/App';` })).toHaveLength(1);
  });

  it('catches the shell importing a specific tool instead of the registry', () => {
    expect(findViolations({ ...clean, 'src/app/Home.tsx': `import { todoTool } from '@/tools/a';` })).toHaveLength(1);
    expect(findViolations({ ...clean, 'src/app/Home.tsx': `import X from '../tools/a/TodoPage';` })).toHaveLength(1);
  });

  it('catches a tool importing the registry or the shell', () => {
    expect(findViolations({ ...clean, 'src/tools/a/x.ts': `import { tools } from '@/tools/registry';` })).toHaveLength(1);
    expect(findViolations({ ...clean, 'src/tools/a/x.ts': `import { App } from '@/app/App';` })).toHaveLength(1);
  });

  it('catches Dexie or storage internals used outside the storage layer', () => {
    expect(findViolations({ ...clean, 'src/tools/a/db.ts': `import Dexie from 'dexie';` })).toHaveLength(1);
    expect(findViolations({ ...clean, 'src/tools/a/db.ts': `import { createDexieStorage } from '@/shared/storage/dexie';` })).toHaveLength(1);
  });

  it('ignores imports that only appear in comments', () => {
    const commented = `// import { x } from '@/tools/a/logic';\n/* import y from '../a/logic' */`;
    expect(findViolations({ ...clean, 'src/tools/b/index.ts': commented })).toEqual([]);
  });
});
