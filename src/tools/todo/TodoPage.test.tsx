import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StorageProvider, createMemoryStorage } from '@/shared/storage';
import TodoPage from './TodoPage';
import type { Priority, Todo } from './types';

function renderPage(backend = createMemoryStorage()) {
  render(
    <StorageProvider backend={backend}>
      <TodoPage />
    </StorageProvider>,
  );
  return backend;
}

interface AddOptions {
  priority?: Priority;
  dueDate?: string;
}

async function addTask(title: string, { priority, dueDate }: AddOptions = {}) {
  const form = screen.getByRole('region', { name: 'Add a task' });
  fireEvent.change(within(form).getByRole('textbox', { name: 'Task' }), { target: { value: title } });
  if (dueDate) fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: dueDate } });
  if (priority) {
    fireEvent.click(within(form).getByRole('radio', { name: priority === 'low' ? 'Low' : priority === 'medium' ? 'Medium' : 'High' }));
  }
  fireEvent.click(within(form).getByRole('button', { name: 'Add' }));
  await screen.findByText(title);
}

const rowTitles = () =>
  screen
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('p')?.textContent ?? '');

const rowFor = (title: string) => screen.getByText(title).closest('li') as HTMLElement;

function seed(backend: ReturnType<typeof createMemoryStorage>, todos: Partial<Todo>[]) {
  const items = backend.collection<Todo>('todo', 'items');
  return Promise.all(
    todos.map((t, i) =>
      items.put({
        id: `seed-${i}`,
        title: `Seed ${i}`,
        completed: false,
        priority: null,
        dueDate: null,
        createdAt: 1_000 + i,
        updatedAt: 1_000 + i,
        completedAt: null,
        ...t,
      }),
    ),
  );
}

describe('Todo tool', () => {
  it('shows an empty state before anything is added', async () => {
    renderPage();
    expect(await screen.findByText('Nothing to do yet')).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('adds a task with priority and due date, then clears the form', async () => {
    renderPage();
    await addTask('Pay rent', { priority: 'high', dueDate: '2099-03-01' });

    const row = within(rowFor('Pay rent'));
    expect(row.getByText('High')).toBeTruthy();
    expect(row.getByText(/Mar/)).toBeTruthy();
    expect(screen.queryByText('Nothing to do yet')).toBeNull();

    const form = screen.getByRole('region', { name: 'Add a task' });
    expect((within(form).getByRole('textbox', { name: 'Task' }) as HTMLInputElement).value).toBe('');
    expect((within(form).getByLabelText('Due date') as HTMLInputElement).value).toBe('');
  });

  it('refuses an empty task and says why', async () => {
    renderPage();
    const form = await screen.findByRole('region', { name: 'Add a task' });
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }));

    expect((await within(form).findByRole('alert')).textContent).toBe('Please enter a task.');
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('flags overdue tasks', async () => {
    renderPage();
    await addTask('File taxes', { dueDate: '2000-01-01' });
    expect(within(rowFor('File taxes')).getByText(/Overdue/)).toBeTruthy();
  });

  it('marks tasks complete / incomplete and filters all, active, completed', async () => {
    renderPage();
    await addTask('One');
    await addTask('Two');

    fireEvent.click(within(rowFor('One')).getByRole('checkbox', { name: 'Mark "One" as done' }));
    await screen.findByRole('radio', { name: 'Done (1)' });
    expect(screen.getByRole('radio', { name: 'Active (1)' })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Active (1)' }));
    expect(rowTitles()).toEqual(['Two']);

    fireEvent.click(screen.getByRole('radio', { name: 'Done (1)' }));
    expect(rowTitles()).toEqual(['One']);

    // Un-complete it from the "completed" view: the list is now empty there.
    fireEvent.click(within(rowFor('One')).getByRole('checkbox', { name: 'Mark "One" as not done' }));
    expect(await screen.findByText('Nothing completed yet')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'All (2)' }));
    expect(rowTitles()).toHaveLength(2);
  });

  it('shows a friendly message when the active list is empty', async () => {
    renderPage();
    await addTask('Only task');
    fireEvent.click(within(rowFor('Only task')).getByRole('checkbox'));
    fireEvent.click(await screen.findByRole('radio', { name: 'Active (0)' }));

    expect(screen.getByText('All caught up')).toBeTruthy();
  });

  it('sorts by due date or created date', async () => {
    const backend = createMemoryStorage();
    await seed(backend, [
      { title: 'No date, oldest', createdAt: 1 },
      { title: 'Due late', dueDate: '2099-12-01', createdAt: 2 },
      { title: 'Due soon', dueDate: '2099-01-01', createdAt: 3 },
    ]);
    renderPage(backend);
    await screen.findByText('Due soon');

    // Default: created date, newest first.
    expect(rowTitles()).toEqual(['Due soon', 'Due late', 'No date, oldest']);

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'due' } });
    expect(rowTitles()).toEqual(['Due soon', 'Due late', 'No date, oldest']);

    // Make the two orders differ: add a newer, later-due task.
    await addTask('Newest, due last', { dueDate: '2099-12-31' });
    expect(rowTitles()).toEqual(['Due soon', 'Due late', 'Newest, due last', 'No date, oldest']);

    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'created' } });
    expect(rowTitles()).toEqual(['Newest, due last', 'Due soon', 'Due late', 'No date, oldest']);
  });

  it('edits a task in a dialog', async () => {
    renderPage();
    await addTask('Draft report');

    fireEvent.click(within(rowFor('Draft report')).getByRole('button', { name: 'Edit "Draft report"' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit task' });
    const title = within(dialog).getByRole('textbox', { name: 'Task' }) as HTMLInputElement;
    expect(title.value).toBe('Draft report');

    fireEvent.change(title, { target: { value: 'Final report' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Medium' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Final report')).toBeTruthy();
    expect(screen.queryByText('Draft report')).toBeNull();
    expect(within(rowFor('Final report')).getByText('Medium')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not save an edit that blanks the title', async () => {
    renderPage();
    await addTask('Keep me');

    fireEvent.click(within(rowFor('Keep me')).getByRole('button', { name: 'Edit "Keep me"' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit task' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Task' }), { target: { value: '  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Please enter a task.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Keep me')).toBeTruthy();
  });

  it('deletes a task only after confirmation', async () => {
    renderPage();
    await addTask('Temporary');

    fireEvent.click(within(rowFor('Temporary')).getByRole('button', { name: 'Delete "Temporary"' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete this task?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Temporary')).toBeTruthy();

    fireEvent.click(within(rowFor('Temporary')).getByRole('button', { name: 'Delete "Temporary"' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete this task?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Nothing to do yet')).toBeTruthy();
  });

  it('clears completed tasks after confirmation, leaving active ones', async () => {
    renderPage();
    await addTask('Active one');
    await addTask('Done one');
    await addTask('Done two');
    fireEvent.click(within(rowFor('Done one')).getByRole('checkbox'));
    fireEvent.click(within(rowFor('Done two')).getByRole('checkbox'));
    await screen.findByRole('radio', { name: 'Done (2)' });

    // Cancel first: nothing is removed.
    fireEvent.click(screen.getByRole('button', { name: 'Clear completed' }));
    let dialog = await screen.findByRole('dialog', { name: 'Clear completed tasks?' });
    expect(within(dialog).getByText(/2 completed tasks/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(rowTitles()).toHaveLength(3);

    // Confirm: only the completed ones go.
    fireEvent.click(screen.getByRole('button', { name: 'Clear completed' }));
    dialog = await screen.findByRole('dialog', { name: 'Clear completed tasks?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear completed' }));

    await waitFor(() => expect(rowTitles()).toEqual(['Active one']));
    expect((screen.getByRole('button', { name: 'Clear completed' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows tasks that were already saved', async () => {
    const backend = createMemoryStorage();
    await seed(backend, [{ title: 'From last time' }]);
    renderPage(backend);

    expect(await screen.findByText('From last time')).toBeTruthy();
    expect(screen.queryByText('Nothing to do yet')).toBeNull();
  });
});
