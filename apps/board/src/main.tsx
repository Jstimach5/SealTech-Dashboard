import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './theme/tokens.css';
import './theme/base.css';
import './ui/ui.css';
import './zones/zones.css';
import './screens/screens.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
