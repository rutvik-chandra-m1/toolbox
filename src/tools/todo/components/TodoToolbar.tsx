import { Trash2 } from 'lucide-react';
import { Button, Field, Segmented, Select, type SegmentedOption } from '@/shared/ui';
import type { TodoFilter, TodoSort } from '../types';

export interface TodoToolbarProps {
  filter: TodoFilter;
  onFilterChange: (filter: TodoFilter) => void;
  sort: TodoSort;
  onSortChange: (sort: TodoSort) => void;
  counts: Record<TodoFilter, number>;
  onClearCompleted: () => void;
}

export function TodoToolbar({
  filter,
  onFilterChange,
  sort,
  onSortChange,
  counts,
  onClearCompleted,
}: TodoToolbarProps) {
  const filterOptions: ReadonlyArray<SegmentedOption<TodoFilter>> = [
    { value: 'all', label: `All (${counts.all})` },
    { value: 'active', label: `Active (${counts.active})` },
    { value: 'completed', label: `Done (${counts.completed})` },
  ];

  return (
    <div className="space-y-3">
      <Segmented legend="Show" value={filter} onChange={onFilterChange} options={filterOptions} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Sort by" className="min-w-44 flex-1">
          <Select value={sort} onChange={(e) => onSortChange(e.target.value as TodoSort)}>
            <option value="created">Created date</option>
            <option value="due">Due date</option>
          </Select>
        </Field>
        <Button variant="ghost" disabled={counts.completed === 0} onClick={onClearCompleted}>
          <Trash2 className="size-5" aria-hidden />
          Clear completed
        </Button>
      </div>
    </div>
  );
}
