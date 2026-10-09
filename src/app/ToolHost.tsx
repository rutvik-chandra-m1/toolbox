import { Suspense } from 'react';
import { ErrorBoundary, PageContainer, Spinner } from '@/shared/ui';
import type { ToolManifest } from '@/shared/tools';

/**
 * Renders any tool's lazy-loaded component. The tool brings its own page
 * layout; a crash inside it is contained here.
 */
export function ToolHost({ tool }: { tool: ToolManifest }) {
  const Tool = tool.component;

  return (
    <ErrorBoundary key={tool.id}>
      <Suspense
        fallback={
          <PageContainer>
            <Spinner />
          </PageContainer>
        }
      >
        <Tool />
      </Suspense>
    </ErrorBoundary>
  );
}
