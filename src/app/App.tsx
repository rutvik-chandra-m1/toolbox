import { RouterProvider } from 'react-router/dom';
import { createAppRouter } from './router';

// Created once, at module load, so the router survives re-renders.
const router = createAppRouter();

export function App() {
  return <RouterProvider router={router} />;
}
