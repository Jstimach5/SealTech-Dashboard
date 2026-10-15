/** The few writes the board makes (docs/http-api.md). Every failure becomes a plain sentence. */
import { withBase } from '../lib/mode.js';

export type ApiOk<T> = { ok: true; status: number; data: T };
export type ApiFail = { ok: false; status: number; error: string; body: Record<string, unknown> | undefined };
export type ApiResult<T> = ApiOk<T> | ApiFail;

export const NEEDS_SERVICE = 'needs the service';

interface Options {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string | undefined;
}

export async function api<T = Record<string, unknown>>(path: string, opts: Options = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(withBase(path), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      cache: 'no-store',
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  } catch {
    return { ok: false, status: 0, error: NEEDS_SERVICE, body: undefined };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, status: res.status, error: res.ok ? 'the service sent no JSON' : NEEDS_SERVICE, body: undefined };
  }
  const body = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : undefined;
  if (res.ok && body?.ok !== false) return { ok: true, status: res.status, data: json as T };
  const error = typeof body?.error === 'string' && body.error.length > 0 ? body.error : res.status === 503 ? NEEDS_SERVICE : `the service said ${res.status}`;
  return { ok: false, status: res.status, error, body };
}

/** Fire-and-forget tap record (decision 38). Errors are ignored. */
export function postTap(screen: string, target: string): void {
  try {
    void fetch(withBase('/api/tap'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen, target }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
