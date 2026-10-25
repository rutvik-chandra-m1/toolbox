import { lazy } from 'react';
import { BookOpen } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';
import { ROUTE, TOOL_ID } from './types';

/** The only thing the rest of the app knows about this tool. */
export const dailyReadTool: ToolManifest = {
  id: TOOL_ID,
  name: 'Daily Read',
  description: 'One short lesson from your books every day, with a notification, a deep read and quick recalls.',
  icon: BookOpen,
  route: ROUTE,
  accent: 'amber',
  component: lazy(() => import('./DailyReadPage')),
  onAppStart: () => {
    import('./startup')
      .then((m) => m.startDailyRead())
      .catch((error: unknown) => console.error('Could not start Daily Read', error));
  },
};
