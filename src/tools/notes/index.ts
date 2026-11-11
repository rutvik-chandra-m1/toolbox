import { lazy } from 'react';
import { StickyNote } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const notesTool: ToolManifest = {
  id: 'notes',
  name: 'Notes',
  description: 'Jot things down fast, pin what matters, search the rest.',
  icon: StickyNote,
  route: '/notes',
  component: lazy(() => import('./NotesPage')),
};
