import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const widths = { sm: 'max-w-xl', md: 'max-w-3xl', lg: 'max-w-5xl' } as const;

/** Centers page content and gives it responsive gutters. */
export function PageContainer({
  size = 'md',
  children,
  className,
}: {
  size?: keyof typeof widths;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-5 sm:px-6 sm:py-8', widths[size], className)}>
      {children}
    </div>
  );
}
