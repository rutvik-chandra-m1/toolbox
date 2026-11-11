import { lazy } from 'react';
import { Timer } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const focusTool: ToolManifest = {
  id: 'focus',
  name: 'Focus Timer',
  description: 'Work in 25-minute sessions with short breaks, and count them.',
  icon: Timer,
  route: '/focus',
  component: lazy(() => import('./FocusPage')),
};
