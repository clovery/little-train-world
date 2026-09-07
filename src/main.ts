import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import './style.css';
import { App } from './App';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing app root');
}

createRoot(root).render(createElement(App));
