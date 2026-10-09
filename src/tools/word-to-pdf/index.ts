import { lazy } from 'react';
import { FileOutput } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

/** The only thing the rest of the app knows about this tool. */
export const wordToPdfTool: ToolManifest = {
  id: 'word-to-pdf',
  name: 'Word to PDF',
  description: 'Convert a .docx file to PDF on your device. Nothing is uploaded.',
  icon: FileOutput,
  route: '/word-to-pdf',
  component: lazy(() => import('./WordToPdfPage')),
};
