import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { requestPersistentStorage } from '@/shared/storage';
import { tools } from '@/tools/registry';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void requestPersistentStorage();

for (const tool of tools) {
  try {
    tool.onAppStart?.();
  } catch (error) {
    console.error(`${tool.id}: start-up task failed`, error); // one tool must not stop the app
  }
}
