import { Link } from 'react-router';
import { SearchX } from 'lucide-react';
import { EmptyState, PageContainer } from '@/shared/ui';

export function NotFoundPage() {
  return (
    <PageContainer size="sm">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="That address doesn't match any tool."
      >
        <Link
          to="/"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-indigo-600 px-4 font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          Back to all tools
        </Link>
      </EmptyState>
    </PageContainer>
  );
}
