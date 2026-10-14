import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite --mode demo` serves the committed fixtures/snapshot.json with no service running.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __BOARD_BUILD__: JSON.stringify(process.env.BOARD_BUILD ?? 'dev'),
    __DEMO_MODE__: JSON.stringify(mode === 'demo'),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: mode === 'demo' ? undefined : { '/snapshot.json': 'http://localhost:8787', '/api': 'http://localhost:8787' },
  },
  preview: { port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: true },
}));
