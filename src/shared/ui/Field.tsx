import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const controlClasses = cn(
  'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900',
  'placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
  'focus-visible:border-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500/40',
);

/** Labelled form control: wrap an <Input> / <Select> and the label is wired up for you. */
export function Field({
  label,
  hideLabel = false,
  children,
  className,
}: {
  label: string;
  hideLabel?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span
        className={cn(
          hideLabel ? 'sr-only' : 'mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300',
        )}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClasses, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlClasses, 'pr-8', className)} {...props} />;
}
