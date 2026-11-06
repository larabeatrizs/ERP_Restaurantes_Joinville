import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './views/App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento raiz da aplicação ausente.');

createRoot(container).render(<StrictMode><App /></StrictMode>);
