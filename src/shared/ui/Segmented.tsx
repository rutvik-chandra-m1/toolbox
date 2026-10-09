import { useId, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedProps<T extends string> {
  /** Accessible group name, e.g. "Priority". */
  legend: string;
  /** Show the legend as a visible label above the control. */
  showLegend?: boolean;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  className?: string;
}

/** Single-choice control rendered as connected buttons (a radio group underneath). */
export function Segmented<T extends string>({
  legend,
  showLegend = false,
  value,
  onChange,
  options,
  className,
}: SegmentedProps<T>) {
  const name = useId();

  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend
        className={cn(
          showLegend ? 'mb-1 text-sm font-medium text-slate-700 dark:text-slate-300' : 'sr-only',
        )}
      >
        {legend}
      </legend>
      <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">
        {options.map((option) => (
          <label key={option.value} className="relative min-w-0 flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-medium',
                'text-slate-600 transition-colors dark:text-slate-300',
                'peer-checked:bg-white peer-checked:text-slate-900 peer-checked:shadow-sm',
                'dark:peer-checked:bg-slate-600 dark:peer-checked:text-white',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-indigo-500',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
