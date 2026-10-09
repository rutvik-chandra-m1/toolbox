import { createHashRouter, type RouteObject } from 'react-router';
import { tools as registeredTools } from '@/tools/registry';
import type { ToolManifest } from '@/shared/tools';
import { AppLayout } from './AppLayout';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { ToolHost } from './ToolHost';

/** Builds the route table from the tool list: nothing here names a specific tool. */
export function createRoutes(tools: readonly ToolManifest[] = registeredTools): RouteObject[] {
  return [
    {
      path: '/',
      element: <AppLayout tools={tools} />,
      children: [
        { index: true, element: <HomePage tools={tools} /> },
        // `/*` lets a tool define its own nested routes below its base route.
        ...tools.map((tool) => ({
          path: `${tool.route.slice(1)}/*`,
          element: <ToolHost tool={tool} />,
        })),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}

/**
 * Hash routing (`#/todo`) keeps deep links and reloads working on any static
 * host, as an installed PWA, and inside the Capacitor WebView - with no server
 * fallback rules needed.
 */
export function createAppRouter() {
  return createHashRouter(createRoutes());
}
