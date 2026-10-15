/**
 * Polls /snapshot.json (or /snapshots/<scenario>.json) every CONFIG.RENDER_TICK_SEC seconds with
 * If-None-Match, validates with SnapshotSchema and keeps the last good snapshot on any failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG, SnapshotSchema, type Snapshot } from '@sealtech/domain';
import { snapshotUrl } from '../lib/mode';

export interface SnapshotState {
  snapshot: Snapshot | undefined;
  /** The most recent poll succeeded (200 or 304). */
  lastFetchOk: boolean;
  /** Wall-clock ms of the last successful poll; undefined until the first one. */
  lastOkAt: number | undefined;
  error: string | undefined;
  /** Increments on every successful poll (the 15-second tick). */
  tick: number;
}

export function useSnapshot(): SnapshotState & { refresh: () => void } {
  const [state, setState] = useState<SnapshotState>({ snapshot: undefined, lastFetchOk: false, lastOkAt: undefined, error: undefined, tick: 0 });
  const etag = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (etag.current) headers['If-None-Match'] = etag.current;
      const res = await fetch(snapshotUrl(), { cache: 'no-store', headers });
      if (res.status === 304) {
        setState((s) => ({ ...s, lastFetchOk: true, lastOkAt: Date.now(), error: undefined, tick: s.tick + 1 }));
        return;
      }
      if (!res.ok) {
        setState((s) => ({ ...s, lastFetchOk: false, error: `snapshot ${res.status}` }));
        return;
      }
      const json: unknown = await res.json();
      const parsed = SnapshotSchema.safeParse(json);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue ? issue.path.join('.') : '';
        setState((s) => ({ ...s, lastFetchOk: false, error: `snapshot schema: ${where} ${issue?.message ?? ''}`.trim() }));
        return;
      }
      etag.current = res.headers.get('ETag') ?? undefined;
      const snapshot = json as Snapshot;
      setState((s) => ({ snapshot, lastFetchOk: true, lastOkAt: Date.now(), error: undefined, tick: s.tick + 1 }));
    } catch (e) {
      setState((s) => ({ ...s, lastFetchOk: false, error: e instanceof Error ? e.message : 'snapshot fetch failed' }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), CONFIG.RENDER_TICK_SEC * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  const refresh = useCallback(() => void load(), [load]);
  return { ...state, refresh };
}
