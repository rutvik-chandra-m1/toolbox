import { defineRegistry } from '@/shared/tools';

/**
 * THE list of tools in the app. The shell (home grid, router, header) is built
 * entirely from this list and knows nothing about any individual tool.
 *
 * To add a tool: create `src/tools/<id>/` (see docs/ADDING_A_TOOL.md), then add
 * its manifest here: an `import` line and one entry in the array.
 */
export const tools = defineRegistry([]);
