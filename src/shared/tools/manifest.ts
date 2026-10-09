import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * What every tool exports (from its folder's `index.ts`) so the shell can show
 * and route to it without knowing anything else about it.
 */
export interface ToolManifest {
  /** Stable kebab-case id, e.g. "todo". Also the tool's storage namespace. */
  id: string;
  /** Short display name, shown on the home card and in the header. */
  name: string;
  /** One sentence shown on the home card. */
  description: string;
  /** Icon component (any component accepting `className`, e.g. a lucide icon). */
  icon: ComponentType<{ className?: string }>;
  /** Absolute path the tool lives at, e.g. "/todo". The tool may nest routes below it. */
  route: string;
  /** The tool's root component, code-split with `React.lazy(() => import('./Page'))`. */
  component: LazyExoticComponent<ComponentType>;
}

const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ROUTE_PATTERN = /^\/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;

/** Throws a descriptive Error if a manifest (or the set of manifests) is malformed. */
export function validateManifests(tools: readonly ToolManifest[]): void {
  const ids = new Set<string>();
  const routes = new Set<string>();

  for (const tool of tools) {
    const label = `Tool "${tool.id}"`;
    if (!ID_PATTERN.test(tool.id)) {
      throw new Error(`${label}: id must be kebab-case (e.g. "word-to-pdf").`);
    }
    if (!tool.name.trim()) throw new Error(`${label}: name is required.`);
    if (!tool.description.trim()) throw new Error(`${label}: description is required.`);
    if (!ROUTE_PATTERN.test(tool.route)) {
      throw new Error(
        `${label}: route "${tool.route}" must be an absolute lowercase path like "/todo" (not "/").`,
      );
    }
    if (ids.has(tool.id)) throw new Error(`${label}: duplicate id.`);
    if (routes.has(tool.route)) throw new Error(`${label}: duplicate route "${tool.route}".`);
    ids.add(tool.id);
    routes.add(tool.route);
  }
}

/** Validates and returns the list of tools. Used by `src/tools/registry.ts`. */
export function defineRegistry(tools: readonly ToolManifest[]): readonly ToolManifest[] {
  validateManifests(tools);
  return tools;
}
