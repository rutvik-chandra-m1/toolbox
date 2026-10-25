import { Link } from 'react-router';
import { Package } from 'lucide-react';
import { EmptyState, PageContainer } from '@/shared/ui';
import type { ToolManifest } from '@/shared/tools';

function ToolCard({ tool }: { tool: ToolManifest }) {
  const Icon = tool.icon;
  return (
    <Link
      to={tool.route}
      data-accent={tool.accent}
      className="flex min-h-28 items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-accent-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-500"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-600 dark:bg-accent-950 dark:text-accent-300">
        <Icon className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold">{tool.name}</span>
        <span className="mt-1 block text-slate-600 dark:text-slate-400">{tool.description}</span>
      </span>
    </Link>
  );
}

/** Grid of cards generated from the tool list: no tool is hard-coded here. */
export function HomePage({ tools }: { tools: readonly ToolManifest[] }) {
  return (
    <PageContainer size="lg">
      <h2 className="text-2xl font-semibold">Your tools</h2>
      <p className="mt-1 text-slate-600 dark:text-slate-400">Pick a tool to get started.</p>

      <div className="mt-6">
        {tools.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No tools yet"
            description="Add a folder under src/tools and register it in src/tools/registry.ts."
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <li key={tool.id}>
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
