import { lazy } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { Camera } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { StorageProvider, createMemoryStorage } from '@/shared/storage';
import type { ToolManifest } from '@/shared/tools';
import { tools as registeredTools } from '@/tools/registry';
import { createRoutes } from './router';

function renderAt(path: string, tools?: readonly ToolManifest[]) {
  const router = createMemoryRouter(createRoutes(tools), { initialEntries: [path] });
  render(
    <StorageProvider backend={createMemoryStorage()}>
      <RouterProvider router={router} />
    </StorageProvider>,
  );
  return router;
}

const fakeTools: ToolManifest[] = [
  {
    id: 'alpha',
    name: 'Alpha Tool',
    description: 'The first fake tool.',
    icon: Camera,
    route: '/alpha',
    component: lazy(async () => ({ default: () => <p>Alpha body</p> })),
  },
  {
    id: 'beta',
    name: 'Beta Tool',
    description: 'The second fake tool.',
    icon: Camera,
    route: '/beta',
    component: lazy(async () => ({ default: () => <p>Beta body</p> })),
  },
];

describe('home screen', () => {
  it('has a card for every tool in the real registry', async () => {
    renderAt('/');
    expect(registeredTools.length).toBeGreaterThan(0);

    for (const tool of registeredTools) {
      const card = await screen.findByRole('link', { name: new RegExp(tool.name) });
      expect(card.getAttribute('href')).toBe(tool.route);
      expect(card.textContent).toContain(tool.description);
    }
  });

  it('is generated purely from whatever tools it is given (nothing hard-coded)', () => {
    renderAt('/', fakeTools);

    expect(screen.getByRole('link', { name: /Alpha Tool/ }).getAttribute('href')).toBe('/alpha');
    expect(screen.getByRole('link', { name: /Beta Tool/ }).getAttribute('href')).toBe('/beta');
    expect(screen.queryByRole('link', { name: /Todo/ })).toBeNull();
  });

  it('shows an empty state with no tools', () => {
    renderAt('/', []);
    expect(screen.getByText('No tools yet')).toBeTruthy();
  });
});

describe('tool accent colour', () => {
  const amberTool: ToolManifest = { ...fakeTools[0]!, id: 'amber-tool', route: '/amber-tool', accent: 'amber' };

  it('a tool can ask for its own accent on its card and in the header; the others keep the default', async () => {
    renderAt('/', [amberTool, fakeTools[1]!]);
    expect(screen.getByRole('link', { name: /Alpha Tool/ }).getAttribute('data-accent')).toBe('amber');
    expect(screen.getByRole('link', { name: /Beta Tool/ }).hasAttribute('data-accent')).toBe(false);

    fireEvent.click(screen.getByRole('link', { name: /Alpha Tool/ }));
    await screen.findByText('Alpha body');
    expect(screen.getByRole('heading', { level: 1, name: 'Alpha Tool' }).closest('[data-accent]')?.getAttribute('data-accent')).toBe('amber');
  });

  it('is amber for Daily Read and indigo (no override) for the other registered tools', () => {
    const accents = Object.fromEntries(registeredTools.map((t) => [t.id, t.accent ?? 'indigo']));
    expect(accents['daily-read']).toBe('amber');
    expect(Object.entries(accents).filter(([id]) => id !== 'daily-read').every(([, a]) => a === 'indigo')).toBe(true);
  });
});

describe('routing', () => {
  it('opens a tool from its card, then returns home with the back button', async () => {
    renderAt('/', fakeTools);

    fireEvent.click(screen.getByRole('link', { name: /Beta Tool/ }));
    expect(await screen.findByText('Beta body')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Beta Tool' })).toBeTruthy();
    expect(document.title).toBe('Beta Tool · Toolbox');

    fireEvent.click(screen.getByRole('link', { name: 'Back to all tools' }));
    expect(await screen.findByRole('link', { name: /Alpha Tool/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Toolbox' })).toBeTruthy();
    expect(document.title).toBe('Toolbox');
  });

  it('serves sub-paths of a tool route with the same tool and header', async () => {
    renderAt('/alpha/anything/deeper', fakeTools);
    expect(await screen.findByText('Alpha body')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Alpha Tool' })).toBeTruthy();
  });

  it('shows "not found" for unknown addresses', () => {
    renderAt('/does-not-exist', fakeTools);
    expect(screen.getByText('Page not found')).toBeTruthy();
  });

  it('every registered tool loads at its route', async () => {
    for (const tool of registeredTools) {
      const { unmount } = renderInto(tool.route);
      expect(await screen.findByRole('heading', { level: 1, name: tool.name })).toBeTruthy();
      expect(screen.queryByText('Something went wrong')).toBeNull();
      unmount();
    }
  });
});

function renderInto(path: string) {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
  return render(
    <StorageProvider backend={createMemoryStorage()}>
      <RouterProvider router={router} />
    </StorageProvider>,
  );
}
