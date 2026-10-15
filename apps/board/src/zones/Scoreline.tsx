/** Scoreline: yesterday's plan kept (raw counts, decision 45) and the company first-pass READY (decision 35, 44). */
import { MISS_REASONS } from '@sealtech/domain';
import { useBoard } from '../context';

export function Scoreline() {
  const { snapshot } = useBoard();
  const s = snapshot.scoreline;
  const misses = MISS_REASONS.filter((r) => (s.misses[r] ?? 0) > 0);
  const fp = s.firstPassReady;
  return (
    <section className="scoreline zone" data-testid="scoreline" aria-label="scoreline">
      <div className="scoreline__left">
        <span className="tier-d caps muted bold">Yesterday</span>
        <span className="tier-d muted">kept</span>
        <span className="tier-c bold">
          {s.kept} of {s.planned}
        </span>
        {s.unknown > 0 && <span className="tier-d muted">({s.unknown} unknown)</span>}
        {misses.map((r) => (
          <span key={r} className="scoreline__miss">
            <span className="tier-d muted">·</span>
            <span className="tier-d caps muted bold">{r}</span>
            <span className="tier-c bold">{s.misses[r]}</span>
          </span>
        ))}
      </div>
      <div className="scoreline__right">
        <span className="tier-d caps muted bold">This week · Ready first pass</span>
        <span className="tier-c bold brand">{fp ? `${fp.ready} of ${fp.total}` : '—'}</span>
      </div>
    </section>
  );
}
