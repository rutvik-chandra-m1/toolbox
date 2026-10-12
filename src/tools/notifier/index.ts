import { lazy } from 'react';
import { BellRing } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';
import { ROUTE, TOOL_ID } from './types';

/** The only thing the rest of the app knows about this tool. */
export const notifierTool: ToolManifest = {
  id: TOOL_ID,
  name: 'Notifier',
  description: 'Get a notification with your own message at the time you choose.',
  icon: BellRing,
  route: ROUTE,
  component: lazy(() => import('./NotifierPage')),
  onAppStart: () => {
    import('./startup')
      .then((m) => m.restoreReminders())
      .catch((error: unknown) => console.error('Could not restore reminders', error));
  },
};
