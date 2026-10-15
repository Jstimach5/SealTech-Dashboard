import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/', import.meta.url));
const SNAPSHOT_NAME = /^[a-z0-9-]+$/;

type Next = (err?: unknown) => void;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function sendFile(req: IncomingMessage, res: ServerResponse, path: string): void {
  const stat = statSync(path);
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(stat.size));
  createReadStream(path).pipe(res);
}

/**
 * Serves the committed fixture snapshots and stubs the service's /api so the board runs with no
 * service: `/snapshot.json` ← fixtures/snapshot.json, `/snapshots/<name>.json` ← fixtures/snapshots/,
 * `/api/*` → 503 "needs the service". Installed on the dev server only in demo mode (otherwise the
 * proxy to :8787 handles these paths) and always on the preview server, which has no proxy.
 */
export function fixtureFiles(opts: { demo: boolean }): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const url = (req.url ?? '/').split('?')[0] ?? '/';
    if (url.startsWith('/api/')) {
      sendJson(res, 503, { ok: false, error: 'needs the service' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    let file: string | undefined;
    if (url === '/snapshot.json') file = join(FIXTURES_DIR, 'snapshot.json');
    else {
      const m = /^\/snapshots\/([^/]+)\.json$/.exec(url);
      const name = m?.[1];
      if (name !== undefined && SNAPSHOT_NAME.test(name)) file = join(FIXTURES_DIR, 'snapshots', `${name}.json`);
    }
    if (file === undefined) {
      next();
      return;
    }
    if (!existsSync(file)) {
      sendJson(res, 404, { ok: false, error: `no fixture snapshot at ${url}` });
      return;
    }
    sendFile(req, res, file);
  };
  return {
    name: 'sealtech-fixture-files',
    configureServer(server) {
      if (opts.demo) server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// `vite --mode demo` serves the committed fixtures/snapshot.json with no service running.
export default defineConfig(({ mode }) => ({
  plugins: [react(), fixtureFiles({ demo: mode === 'demo' })],
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
