/**
 * The board clock. It is frozen at snapshot.generatedAt (or at ?now=) only for the demo build or an
 * explicit `?now=` / `?scenario=` (or `#scenario`) URL, so committed fixtures and the Playwright
 * screenshots render identically on any day. Everything else runs the real clock, including a
 * service in fixture mode with FIXTURE_NOW blank (the office trial): the display ticks every second,
 * the derived state (chips, staleness, freshness dots) every CONFIG.RENDER_TICK_SEC, so a stopped
 * service shows the STALE banner instead of a frozen picture.
 */
import { useEffect, useState } from 'react';
import { CONFIG, type Instant, type Snapshot } from '@sealtech/domain';
import { DEMO_BUILD, nowOverride, scenarioParam } from '../lib/mode';

export interface Clock {
  /** Drives derived state (chips, staleness, lanes). */
  now: Instant;
  /** Drives the top-bar clock. */
  displayNow: Instant;
  frozen: boolean;
}

/** The clock is frozen for the demo build and for an explicit ?now= / ?scenario= URL; never because of snapshot.mode alone. */
export function clockFrozen(): boolean {
  return DEMO_BUILD || nowOverride() !== undefined || scenarioParam() !== undefined;
}

export function useNow(snapshot: Snapshot | undefined): Clock {
  const frozenAt = snapshot && clockFrozen() ? (nowOverride() ?? snapshot.generatedAt) : undefined;
  const [live, setLive] = useState(() => new Date().toISOString());
  const [display, setDisplay] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (frozenAt !== undefined) return;
    const a = window.setInterval(() => setDisplay(new Date().toISOString()), 1000);
    const b = window.setInterval(() => setLive(new Date().toISOString()), CONFIG.RENDER_TICK_SEC * 1000);
    return () => {
      window.clearInterval(a);
      window.clearInterval(b);
    };
  }, [frozenAt]);

  if (frozenAt !== undefined) return { now: frozenAt, displayNow: frozenAt, frozen: true };
  return { now: live, displayNow: display, frozen: false };
}
