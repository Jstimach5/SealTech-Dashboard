import React from 'react';
import { createRoot } from 'react-dom/client';

declare const __BOARD_BUILD__: string;
declare const __DEMO_MODE__: boolean;

function Placeholder() {
  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: 48 }}>
      <h1>SealTech Board</h1>
      <p>Build {__BOARD_BUILD__} · demo mode {String(__DEMO_MODE__)} · screens arrive at M3.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Placeholder />
  </React.StrictMode>,
);
