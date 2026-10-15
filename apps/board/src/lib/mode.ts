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

/** `?scenario=<name>` loads /snapshots/<name>.json instead of /snapshot.json. */
export function scenarioParam(): string | undefined {
  const s = params().get('scenario');
  return s && /^[a-z0-9-]+$/.test(s) ? s : undefined;
}

/** `?now=<ISO>` freezes the clock (fixture mode only). */
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
  return scenario ? `/snapshots/${scenario}.json` : '/snapshot.json';
}
