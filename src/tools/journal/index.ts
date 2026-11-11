import { lazy } from 'react';
import { NotebookPen } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const journalTool: ToolManifest = {
  id: 'journal',
  name: 'Journal',
  description: 'A few lines and a mood for each day, easy to look back on.',
  icon: NotebookPen,
  route: '/journal',
  component: lazy(() => import('./JournalPage')),
};
