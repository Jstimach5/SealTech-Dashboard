/** NEEDS ATTENTION: Jobber's own Late / Action required / Requires invoicing lines (decision 29), oldest first within kind. */
import { useRef } from 'react';
import { BUCKET_LABEL, CONFIG, ownerText } from '@sealtech/domain';
import { useBoard } from '../context';
import { splitLabel } from '../lib/format';
import { FitText } from '../ui/FitText';
import { clipRows, useFitRows } from '../ui/useFitRows';

const ROW = 46;
const GAP = 4;

export function AttentionStrip() {
  const { snapshot } = useBoard();
  const ref = useRef<HTMLDivElement>(null);
  const fits = useFitRows(ref, ROW, GAP);
  const { shown, hidden } = clipRows(snapshot.attention.length, fits, CONFIG.MAX_ATTENTION_ROWS, false);
  return (
    <section className="attention zone" data-testid="attention" aria-label="needs attention">
      <div className="attention__head">
        <span className="tier-d caps bold act">Needs attention</span>
        {hidden > 0 && <span className="tier-d muted">+{hidden} more</span>}
        {snapshot.attention.length === 0 && <span className="tier-d muted">nothing · all buckets clear</span>}
      </div>
      <div className="attention__rows" ref={ref}>
        {snapshot.attention.slice(0, shown).map((line) => {
          const { lastName, city, scope } = splitLabel(line.label);
          return (
            <div key={line.jobId} className="attention__row" data-testid={`attention-row-${line.jobId}`} data-kind={line.kind}>
              <span className={`attention__word attention__word--${line.kind}`}>
                <FitText text={BUCKET_LABEL[line.kind]} max={42} min={24} className="bold caps" style={{ textAlign: 'center' }} />
              </span>
              <span className="attention__label tier-c">
                <b>{lastName}</b>
                {city && (
                  <>
                    <span className="sep">·</span>
                    <span className="attention__city">{city}</span>
                  </>
                )}
                {scope && (
                  <>
                    <span className="sep">·</span>
                    <span>{scope}</span>
                  </>
                )}
              </span>
              <span className="attention__age tier-c">
                <span className="sep">·</span>
                <b>{line.ageDays} d</b>
                {line.sinceSource === 'updatedAt' && (
                  <span className="muted" title="approximate: bucket first seen at the job's last update">
                    ~
                  </span>
                )}
                <span className="sep">·</span>
                <span>{ownerText(line.owner)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
