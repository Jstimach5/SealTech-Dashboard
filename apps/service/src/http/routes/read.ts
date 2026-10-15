/** GET /snapshot.json and GET /health (docs/http-api.md, Reads). */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BoardService } from '../../service.js';

const NO_STORE = 'no-store';

/** True when any entity tag in an If-None-Match header equals `etag` (weak prefixes tolerated). */
export function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((t) => t.trim().replace(/^W\//, ''))
    .includes(etag);
}

export function serveSnapshot(service: BoardService, req: IncomingMessage, res: ServerResponse): void {
  const body = service.body();
  const etag = service.etag();
  if (body === undefined || etag === undefined) {
    const text = JSON.stringify({ ok: false, error: 'no snapshot yet' });
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': NO_STORE, 'Retry-After': '5' });
    res.end(text);
    return;
  }
  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': NO_STORE });
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ETag: etag, 'Cache-Control': NO_STORE });
  res.end(req.method === 'HEAD' ? undefined : body);
}

export function healthBody(service: BoardService): Record<string, unknown> {
  const s = service.snapshot();
  return {
    ok: s !== undefined && service.lastPollOk,
    build: service.config.build,
    mode: service.config.dataSource,
    generatedAt: s?.generatedAt ?? null,
    boardDate: s?.boardDate ?? null,
    sources: s?.sources ?? null,
    queued: service.queuedCount(),
    ...(service.lastError !== undefined ? { error: service.lastError } : {}),
  };
}

export function serveHealth(service: BoardService, _req: IncomingMessage, res: ServerResponse): void {
  const body = healthBody(service);
  const text = JSON.stringify(body);
  res.writeHead(service.snapshot() ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': NO_STORE });
  res.end(text);
}
