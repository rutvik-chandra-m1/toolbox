import { lazy } from 'react';
import { Wallet } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const spendingTool: ToolManifest = {
  id: 'spending',
  name: 'Spending',
  description: 'Log what you spend and see today and this month at a glance.',
  icon: Wallet,
  route: '/spending',
  component: lazy(() => import('./SpendingPage')),
};
