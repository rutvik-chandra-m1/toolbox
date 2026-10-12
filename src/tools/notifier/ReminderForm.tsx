import { useId, useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@/shared/ui';
import type { ReminderDraft } from './types';

export interface ReminderFormProps {
  initial: ReminderDraft;
  submitLabel: string;
  /** Resolve to accept; throw an Error to show its message in the form. */
  onSubmit: (draft: ReminderDraft) => Promise<void>;
  onCancel?: () => void;
  /** Clear the message after a successful save (adding, not editing). */
  resetOnSubmit?: boolean;
}

export function ReminderForm({ initial, submitLabel, onSubmit, onCancel, resetOnSubmit = false }: ReminderFormProps) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const set = (patch: Partial<ReminderDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(draft);
      if (resetOnSubmit) setDraft((d) => ({ ...d, message: '' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Message">
        <Input
          type="text"
          value={draft.message}
          onChange={(e) => set({ message: e.target.value })}
          placeholder="e.g. Ask teacher about AICTE points"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Time">
          <Input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
        </Field>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
