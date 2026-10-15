/**
 * The one HTTP server (node:http): the built board at `/`, `/snapshot.json`, `/health` and the
 * `/api/*` writes. Same origin as the board, so no CORS. JSON bodies are capped at 64 KB.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_HOST } from '../config.js';
import { errorMessage } from '../log.js';
import type { BoardService } from '../service.js';
import { HttpError, type Reply } from './context.js';
import { ROUTES } from './routes/index.js';
import { serveHealth, serveSnapshot } from './routes/read.js';
import { serveStatic } from './static.js';

export const MAX_BODY_BYTES = 64 * 1024;

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
}

/** The request body as JSON; an empty body is `{}`. Larger than MAX_BODY_BYTES or not JSON → 400. */
export function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk: Buffer) => {
      if (tooBig) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooBig = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(400, `body larger than ${MAX_BODY_BYTES / 1024} KB`));
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim() === '') return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'body is not JSON'));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

const GET_HEAD = 'GET, HEAD';

/** 405 with the `Allow` header RFC 9110 asks for. */
function methodNotAllowed(message: string, allow: string): HttpError {
  return new HttpError(405, message, {}, { Allow: allow });
}

async function handle(service: BoardService, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  try {
    if (url.pathname === '/snapshot.json') {
      if (method !== 'GET' && method !== 'HEAD') throw methodNotAllowed('GET only', GET_HEAD);
      serveSnapshot(service, req, res);
      return;
    }
    if (url.pathname === '/health') {
      if (method !== 'GET' && method !== 'HEAD') throw methodNotAllowed('GET only', GET_HEAD);
      serveHealth(service, req, res);
      return;
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const route = ROUTES[url.pathname];
      if (!route) throw new HttpError(404, `no such API route: ${url.pathname}`);
      if (route.method !== method) throw methodNotAllowed(`${url.pathname} takes ${route.method}`, route.method);
      const body = method === 'POST' ? await readJson(req) : {};
      const reply: Reply = await route.handler({ req, res, url, service, body });
      sendJson(res, reply.status ?? 200, reply.body);
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') throw methodNotAllowed('GET only', GET_HEAD);
    serveStatic(service.config.boardDist, url.pathname, res, method === 'HEAD');
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err instanceof HttpError) {
      sendJson(res, err.status, { ok: false, error: err.message, ...err.extra }, err.headers);
      return;
    }
    service.log.error(`${method} ${url.pathname} 500 ${errorMessage(err)}`);
    sendJson(res, 500, { ok: false, error: 'internal error' });
  }
}

export function createHttpServer(service: BoardService): Server {
  return createServer((req, res) => {
    void handle(service, req, res);
  });
}

/** Binds loopback unless a host is given (config.host from HOST; the board PC is the only client today). */
export function listen(server: Server, port: number, host: string = DEFAULT_HOST): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address() as AddressInfo);
    });
  });
}
