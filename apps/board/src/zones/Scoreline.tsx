/** Scoreline: yesterday's plan kept (raw counts, decision 45) and the company first-pass READY (decision 35, 44). */
import { useLayoutEffect, useRef, useState } from 'react';
import { MISS_REASONS } from '@sealtech/domain';
import { useBoard } from '../context';

/** When the miss reasons do not all fit, the first two show and the rest become `+N more`. */
const KEEP_WHEN_CLIPPED = 2;

export function Scoreline() {
  const { snapshot } = useBoard();
  const s = snapshot.scoreline;
  const misses = MISS_REASONS.filter((r) => (s.misses[r] ?? 0) > 0);
  const fp = s.firstPassReady;
  const key = misses.map((r) => `${r}:${s.misses[r] ?? 0}`).join('|');
  const leftRef = useRef<HTMLDivElement>(null);
  // How many miss reasons print. Starts at all; drops to two (then fewer, only if even two do not fit).
  const [fit, setFit] = useState({ key, shown: misses.length });
  const shown = fit.key === key ? fit.shown : misses.length;
  useLayoutEffect(() => {
    const el = leftRef.current;
    if (!el) return;
    if (fit.key !== key) {
      setFit({ key, shown: misses.length });
      return;
    }
    if (shown > 0 && el.scrollWidth > el.clientWidth + 1) {
      setFit({ key, shown: shown >= misses.length ? Math.min(KEEP_WHEN_CLIPPED, misses.length - 1) : shown - 1 });
    }
  });
  useLayoutEffect(() => {
    let alive = true;
    void document.fonts?.ready?.then(() => {
      if (alive) setFit((f) => ({ ...f, shown: Number.POSITIVE_INFINITY }));
    });
    return () => {
      alive = false;
    };
  }, []);
  const visible = misses.slice(0, Math.min(shown, misses.length));
  const hidden = misses.length - visible.length;
  return (
    <section className="scoreline zone" data-testid="scoreline" aria-label="scoreline">
      <div className="scoreline__left" ref={leftRef}>
        <span className="tier-d caps muted bold">Yesterday</span>
        <span className="tier-d muted">kept</span>
        <span className="tier-c bold">
          {s.kept} of {s.planned}
        </span>
        {s.unknown > 0 && <span className="tier-d muted">({s.unknown} unknown)</span>}
        {visible.map((r) => (
          <span key={r} className="scoreline__miss">
            <span className="tier-d muted">·</span>
            <span className="tier-d caps muted bold">{r}</span>
            <span className="tier-c bold">{s.misses[r]}</span>
          </span>
        ))}
        {hidden > 0 && (
          <span className="scoreline__miss" data-testid="scoreline-more">
            <span className="tier-d muted">·</span>
            <span className="tier-d muted bold">+{hidden} more</span>
          </span>
        )}
      </div>
      <div className="scoreline__right" data-testid="scoreline-right">
        <span className="tier-d caps muted bold">This week · Ready first pass</span>
        <span className="tier-c bold brand">{fp ? `${fp.ready} of ${fp.total}` : '—'}</span>
      </div>
    </section>
  );
}
