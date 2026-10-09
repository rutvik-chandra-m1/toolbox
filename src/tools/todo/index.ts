import { lazy } from 'react';
import { ListChecks } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';
import { TOOL_ID } from './constants';

/** The only thing the rest of the app knows about this tool. */
export const todoTool: ToolManifest = {
  id: TOOL_ID,
  name: 'Todo',
  description: 'Track tasks with due dates and priorities.',
  icon: ListChecks,
  route: '/todo',
  component: lazy(() => import('./TodoPage')),
};
