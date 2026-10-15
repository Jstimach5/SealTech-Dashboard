/**
 * Stale indicator (brief §2; decision 1, 47). The board is a derived view of Jobber, so a board that
 * has not loaded for a while must say so: a footer dot turns amber at STALE_AMBER_MIN minutes and the
 * full-width STALE banner appears at STALE_RED_MIN. The clock runs from `lastOkAt`, which the service
 * only ever moves on a complete successful load; `lastAttemptAt` and `ok` say nothing about freshness
 * and are never consulted here. Pure functions; `now` is always passed in.
 */
import { CONFIG } from '../config.js';
import type { Instant, SourceName, SourceStatus } from '../types.js';
import { minutesBetween } from './time.js';

export type Freshness = 'green' | 'amber' | 'red' | 'off';

export interface BoardStaleness {
  stale: boolean;
  lastJobberOkAt?: Instant;
  minutesSince?: number;
}

/**
 * Brief §2: 'off' when the source is not connected; otherwise by minutes since the last complete
 * successful load — none ever → 'red', under STALE_AMBER_MIN → 'green', under STALE_RED_MIN → 'amber',
 * else 'red'. Thresholds are inclusive on the stale side (exactly 10 min is amber, exactly 30 is red).
 */
export function sourceFreshness(s: SourceStatus, now: Instant): Freshness {
  if (!s.connected) return 'off';
  if (!s.lastOkAt) return 'red';
  const minutes = minutesBetween(s.lastOkAt, now);
  if (minutes < CONFIG.STALE_AMBER_MIN) return 'green';
  if (minutes < CONFIG.STALE_RED_MIN) return 'amber';
  return 'red';
}

/**
 * Decision 1 / brief §2: Jobber is the primary source, so the board is stale exactly when the jobber
 * source is 'red'. The sheets going red never raises the banner on their own, and a jobber source
 * that is 'off' (fixtures mode, decision 47) is not stale. `minutesSince` is rounded down.
 */
export function boardStale(sources: Record<SourceName, SourceStatus>, now: Instant): BoardStaleness {
  const jobber = sources.jobber;
  const out: BoardStaleness = { stale: sourceFreshness(jobber, now) === 'red' };
  if (jobber.lastOkAt) {
    out.lastJobberOkAt = jobber.lastOkAt;
    out.minutesSince = Math.floor(minutesBetween(jobber.lastOkAt, now));
  }
  return out;
}
