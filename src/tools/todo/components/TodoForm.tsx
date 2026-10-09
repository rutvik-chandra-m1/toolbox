import { useId, useRef, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Field, IconButton, Input, Segmented, type SegmentedOption } from '@/shared/ui';
import { MAX_TITLE_LENGTH, validateDraft } from '../logic';
import type { Priority, TodoDraft } from '../types';

type PriorityChoice = Priority | 'none';

const PRIORITY_OPTIONS: ReadonlyArray<SegmentedOption<PriorityChoice>> = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const EMPTY_DRAFT: TodoDraft = { title: '', priority: null, dueDate: null };

export interface TodoFormProps {
  initial?: TodoDraft;
  /** `inline`: the submit button sits next to the title (adding). `dialog`: Cancel / Save row below. */
  layout: 'inline' | 'dialog';
  submitLabel: string;
  /** Resolve to accept the draft; throw an Error to show its message in the form. */
  onSubmit: (draft: TodoDraft) => Promise<void>;
  onCancel?: () => void;
  /** Clear the form (and refocus the title) after a successful submit. */
  resetOnSubmit?: boolean;
  autoFocus?: boolean;
}

export function TodoForm({
  initial = EMPTY_DRAFT,
  layout,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSubmit = false,
  autoFocus = false,
}: TodoFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [dueDate, setDueDate] = useState(initial.dueDate ?? '');
  const [priority, setPriority] = useState<PriorityChoice>(initial.priority ?? 'none');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const result = validateDraft({
      title,
      dueDate: dueDate || null,
      priority: priority === 'none' ? null : priority,
    });
    if (!result.ok) {
      setError(result.error);
      titleRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(result.value);
      setError(null);
      if (resetOnSubmit) {
        setTitle('');
        setDueDate('');
        setPriority('none');
        titleRef.current?.focus();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const submitButton = (
    <Button type="submit" variant="primary" disabled={submitting}>
      {layout === 'inline' && <Plus className="size-5" aria-hidden />}
      {submitLabel}
    </Button>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="flex items-end gap-2">
        <Field label="Task" hideLabel={layout === 'inline'} className="flex-1">
          <Input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            placeholder="What needs doing?"
            maxLength={MAX_TITLE_LENGTH}
            autoComplete="off"
            autoFocus={autoFocus}
            enterKeyHint="done"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </Field>
        {layout === 'inline' && submitButton}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <Field label="Due date" className="flex-1">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          {dueDate && (
            <IconButton label="Clear due date" onClick={() => setDueDate('')}>
              <X className="size-5" aria-hidden />
            </IconButton>
          )}
        </div>
        <Segmented
          legend="Priority"
          showLegend
          value={priority}
          onChange={setPriority}
          options={PRIORITY_OPTIONS}
        />
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {layout === 'dialog' && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {submitButton}
        </div>
      )}
    </form>
  );
}
