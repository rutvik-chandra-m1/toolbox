import { defineRegistry } from '@/shared/tools';
import { converterTool } from './converter';
import { dailyReadTool } from './daily-read';
import { daysUntilTool } from './days-until';
import { focusTool } from './focus';
import { habitsTool } from './habits';
import { journalTool } from './journal';
import { notesTool } from './notes';
import { notifierTool } from './notifier';
import { spendingTool } from './spending';
import { waterTool } from './water';

/**
 * THE list of tools in the app. The shell (home grid, router, header) is built
 * entirely from this list and knows nothing about any individual tool.
 *
 * To add a tool: create `src/tools/<id>/` (see docs/ADDING_A_TOOL.md), then add
 * its manifest here: an `import` line and one entry in the array.
 */
export const tools = defineRegistry([
  habitsTool,
  notifierTool,
  dailyReadTool,
  focusTool,
  waterTool,
  spendingTool,
  journalTool,
  notesTool,
  daysUntilTool,
  converterTool,
]);
