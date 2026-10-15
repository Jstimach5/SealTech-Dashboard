/** Footer: source freshness dots, responder, board owner, build, queued writes, DPR badge, snapshot errors. */
import { sourceFreshness, type SourceName } from '@sealtech/domain';
import { useBoard } from '../context';
import { DEMO_BUILD, kioskMode } from '../lib/mode';
import { Tag } from '../ui/Tag';

const SOURCES: Array<{ key: SourceName; label: string }> = [
  { key: 'jobber', label: 'JOBBER' },
  { key: 'reviewSheet', label: 'REVIEW' },
  { key: 'flagsSheet', label: 'FLAGS' },
  { key: 'companyCam', label: 'PHOTOS' },
];

export function Footer() {
  const { snapshot, now, error, tick, lastFetchOk } = useBoard();
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 2;
  const showDpr = kioskMode() && dpr !== 2 && !DEMO_BUILD;
  const queued = snapshot.queuedWrites.filter((w) => w.status !== 'sent').length;
  return (
    <footer className="footer zone tier-d" data-testid="footer">
      <div className="footer__sources" aria-label="source freshness">
        {SOURCES.map((s) => {
          const f = sourceFreshness(snapshot.sources[s.key], now);
          return (
            <span key={s.key} className="footer__source" data-testid={`fresh-${s.key}`} data-freshness={f}>
              <span className={`dot dot--${f}`} aria-hidden="true" />
              <span className="caps">{s.label}</span>
              <span className="sr-only">{f === 'off' ? 'not connected' : f}</span>
            </span>
          );
        })}
      </div>
      <span className="muted">
        responder <b className="footer__ink">{snapshot.responderInitials ?? '—'}</b>
      </span>
      <span className="muted">
        board owner <b className="footer__ink">{snapshot.boardOwnerInitials}</b>
      </span>
      <span className="muted">build {snapshot.build}</span>
      {queued > 0 && (
        <span className="muted" data-testid="queued">
          queued <b className="footer__ink">{queued}</b>
        </span>
      )}
      {showDpr && <Tag text={`DPR ${dpr}`} tone="act" testId="dpr-warning" />}
      {error && (
        <span className="act ellipsis footer__error" data-testid="snapshot-error" title={error}>
          {error}
        </span>
      )}
      <span className={`tick-dot ${tick % 2 === 0 ? 'tick-dot--a' : 'tick-dot--b'} ${lastFetchOk ? '' : 'tick-dot--bad'}`} aria-hidden="true" />
    </footer>
  );
}
