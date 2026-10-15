/**
 * The poll loop. Live: every 60 s between 06:00 and 18:30 Detroit local, every 10 min otherwise.
 * Fixtures: every 15 s, so a write shows on the wall within one board tick (CONFIG.RENDER_TICK_SEC).
 * After three consecutive failures the interval backs off to 10 min until a poll succeeds.
 */
import { localParts, type Instant } from '@sealtech/domain';
import type { DataSource } from './config.js';
import type { Logger } from './log.js';
import type { BoardService } from './service.js';

export const FIXTURE_TICK_MS = 15_000;
export const DAY_MS = 60_000;
export const NIGHT_MS = 600_000;
export const BACKOFF_MS = 600_000;
export const BACKOFF_AFTER = 3;
export const DAY_START_MIN = 6 * 60;
export const DAY_END_MIN = 18 * 60 + 30;

export function cadenceMs(now: Instant, mode: DataSource, consecutiveFailures = 0): number {
  if (consecutiveFailures >= BACKOFF_AFTER) return BACKOFF_MS;
  if (mode === 'fixtures') return FIXTURE_TICK_MS;
  const p = localParts(now);
  const minute = p.h * 60 + p.min;
  return minute >= DAY_START_MIN && minute < DAY_END_MIN ? DAY_MS : NIGHT_MS;
}

export interface PollLoop {
  stop(): void;
}

export function startPollLoop(service: BoardService, log: Logger): PollLoop {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    const r = await service.poll();
    if (!r.ok && service.consecutiveFailures === BACKOFF_AFTER) log.warn(`poll backing off to ${BACKOFF_MS / 60_000} min after ${BACKOFF_AFTER} consecutive failures`);
    if (stopped) return;
    timer = setTimeout(() => void tick(), cadenceMs(service.clock.now(), service.config.dataSource, service.consecutiveFailures));
  };
  void tick();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
