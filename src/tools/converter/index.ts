import { lazy } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { ToolManifest } from '@/shared/tools';

export const converterTool: ToolManifest = {
  id: 'converter',
  name: 'Converter',
  description: 'Convert length, weight, temperature, volume, speed and more.',
  icon: ArrowLeftRight,
  route: '/converter',
  component: lazy(() => import('./ConverterPage')),
};
