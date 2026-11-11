import { lazy } from 'react';
import { GlassWater } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const waterTool: ToolManifest = {
  id: 'water',
  name: 'Water',
  description: 'Count the glasses you drink and hit your daily goal.',
  icon: GlassWater,
  route: '/water',
  component: lazy(() => import('./WaterPage')),
};
