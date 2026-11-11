import { lazy } from 'react';
import { Flame } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const habitsTool: ToolManifest = {
  id: 'habits',
  name: 'Habits',
  description: 'Tick off daily habits and keep your streaks alive.',
  icon: Flame,
  route: '/habits',
  component: lazy(() => import('./HabitsPage')),
};
