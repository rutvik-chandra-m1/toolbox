import { lazy } from 'react';
import { Images } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

/** The only thing the rest of the app knows about this tool. */
export const imagesToPdfTool: ToolManifest = {
  id: 'images-to-pdf',
  name: 'Images to PDF',
  description: 'Turn photos into one searchable PDF, with text you can select and copy. Nothing is uploaded.',
  icon: Images,
  route: '/images-to-pdf',
  component: lazy(() => import('./ImagesToPdfPage')),
};
