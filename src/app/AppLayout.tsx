import { useEffect } from 'react';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { Link, Outlet, matchPath, useLocation } from 'react-router';
import type { ToolManifest } from '@/shared/tools';

/** Finds the tool whose route (or a sub-route of it) matches the path. */
export function findToolForPath(
  tools: readonly ToolManifest[],
  pathname: string,
): ToolManifest | undefined {
  return tools.find((tool) => matchPath({ path: tool.route, end: false }, pathname));
}

export function AppLayout({ tools }: { tools: readonly ToolManifest[] }) {
  const { pathname } = useLocation();
  const tool = findToolForPath(tools, pathname);

  useEffect(() => {
    document.title = tool ? `${tool.name} · Toolbox` : 'Toolbox';
  }, [tool]);

  const ToolIcon = tool?.icon;

  return (
    <div data-accent={tool?.accent} className="flex min-h-dvh flex-col pr-(--inset-right) pl-(--inset-left)">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/90 pt-(--inset-top) backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-2 sm:px-4">
          {tool && ToolIcon ? (
            <>
              <Link
                to="/"
                aria-label="Back to all tools"
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-accent-500 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="size-6" aria-hidden />
              </Link>
              <ToolIcon className="size-5 shrink-0 text-accent-600 dark:text-accent-400" />
              <h1 className="truncate text-lg font-semibold">{tool.name}</h1>
            </>
          ) : (
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg px-2 py-2 focus-visible:outline-2 focus-visible:outline-accent-500"
            >
              <LayoutGrid className="size-6 text-accent-600 dark:text-accent-400" aria-hidden />
              <h1 className="text-lg font-semibold">Toolbox</h1>
            </Link>
          )}
        </div>
      </header>
      <main className="flex-1 pb-(--inset-bottom)">
        <Outlet />
      </main>
    </div>
  );
}
