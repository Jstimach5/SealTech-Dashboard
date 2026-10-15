/** URL and environment flags read once at load. */

function params(): URLSearchParams {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

/** `vite --mode demo`: no service behind the board; /api is stubbed. */
export const DEMO_BUILD: boolean = typeof __DEMO_MODE__ !== 'undefined' && __DEMO_MODE__;
export const BOARD_BUILD: string = typeof __BOARD_BUILD__ !== 'undefined' ? __BOARD_BUILD__ : 'dev';

/** The build's base path (`/` for the service, `./` for a hosted demo bundle); every fetch is made under it. */
export const BASE_PATH: string = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';

/** `/api/x` or `/snapshot.json` → the same path under BASE_PATH. */
export function withBase(path: string): string {
  const base = BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`;
  return base + path.replace(/^\/+/, '');
}

/**
 * `?scenario=<name>` (or `#<name>` where a host drops query strings) loads /snapshots/<name>.json
 * instead of /snapshot.json.
 */
export function scenarioParam(): string | undefined {
  const fromQuery = params().get('scenario');
  let s = fromQuery;
  if (!s) {
    try {
      s = window.location.hash.replace(/^#/, '');
    } catch {
      s = null;
    }
  }
  return s && /^[a-z0-9-]+$/.test(s) ? s : undefined;
}

/** `?wall=1` forces the wall layout on any window (a laptop driving a TV for the read test). */
export function wallForced(): boolean {
  return params().get('wall') === '1';
}

/** `?now=<ISO>` freezes the board clock at that instant (see data/useNow.ts). */
export function nowOverride(): string | undefined {
  const s = params().get('now');
  if (!s) return undefined;
  return Number.isNaN(new Date(s).getTime()) ? undefined : new Date(s).toISOString();
}

/** The panel runs with `?kiosk=1` (or localStorage.kiosk = '1'): watchdog reload and the DPR warning apply. */
export function kioskMode(): boolean {
  if (params().get('kiosk') === '1') return true;
  try {
    return window.localStorage.getItem('kiosk') === '1';
  } catch {
    return false;
  }
}

export function snapshotUrl(): string {
  const scenario = scenarioParam();
  return withBase(scenario ? `/snapshots/${scenario}.json` : '/snapshot.json');
}
