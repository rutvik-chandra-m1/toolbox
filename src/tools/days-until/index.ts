import { lazy } from 'react';
import { CalendarClock } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const daysUntilTool: ToolManifest = {
  id: 'days-until',
  name: 'Days Until',
  description: 'Count the days to birthdays, exams, trips and deadlines.',
  icon: CalendarClock,
  route: '/days-until',
  component: lazy(() => import('./DaysUntilPage')),
};
