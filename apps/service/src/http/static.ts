/** Serves the built board (`BOARD_DIST`) with SPA fallback to index.html. Paths never escape the directory. */
import { readFileSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The file inside `dist` a request path maps to, or undefined when it would escape or does not exist. */
export function resolveStatic(dist: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const root = resolve(dist);
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  const file = resolve(root, rel);
  if (file !== root && !file.startsWith(root + sep)) return undefined;
  if (isFile(file)) return file;
  return undefined;
}

export function serveStatic(dist: string, pathname: string, res: ServerResponse, head = false): void {
  const file = resolveStatic(dist, pathname) ?? join(resolve(dist), 'index.html');
  if (!isFile(file)) {
    const text = `board not built: ${resolve(dist)} has no index.html (run: npm run build -w apps/board)\n`;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
    res.end(head ? undefined : text);
    return;
  }
  const bytes = readFileSync(file);
  const hashedAsset = /[/\\]assets[/\\][^/\\]+-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/.test(file);
  res.writeHead(200, {
    'Content-Type': contentType(file),
    'Content-Length': bytes.length,
    'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(head ? undefined : bytes);
}
