/**
 * The board clock. Fixture mode (demo build or snapshot.mode === 'fixtures') freezes `now` at
 * snapshot.generatedAt (or ?now=) so committed fixtures render identically on any day. Live mode
 * ticks the display every second and the derived state every CONFIG.RENDER_TICK_SEC.
 */
import { useEffect, useState } from 'react';
import { CONFIG, type Instant, type Snapshot } from '@sealtech/domain';
import { DEMO_BUILD, nowOverride } from '../lib/mode';

export interface Clock {
  /** Drives derived state (chips, staleness, lanes). */
  now: Instant;
  /** Drives the top-bar clock. */
  displayNow: Instant;
  frozen: boolean;
}

export function isFixtureMode(snapshot: Snapshot | undefined): boolean {
  return DEMO_BUILD || snapshot?.mode === 'fixtures';
}

export function useNow(snapshot: Snapshot | undefined): Clock {
  const frozenAt = snapshot && isFixtureMode(snapshot) ? (nowOverride() ?? snapshot.generatedAt) : undefined;
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
