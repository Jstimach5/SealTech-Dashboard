/** NEEDS ATTENTION: Jobber's own Late / Action required / Requires invoicing lines (decision 29), oldest first within kind. */
import { useRef } from 'react';
import { BUCKET_LABEL, CHIP, CONFIG, ownerText, type AttentionBucket } from '@sealtech/domain';
import { useBoard } from '../context';
import { splitLabel } from '../lib/format';
import { FitText } from '../ui/FitText';
import { clipRows, useFitRows } from '../ui/useFitRows';

const ROW = 46;
const GAP = 4;

/**
 * The trigger word, tier C shrink-to-fit. LATE is red, so it carries its icon (decision 27).
 * REQUIRES INVOICING never drops below 32 px: where it cannot fit it prints REQ. INVOICING.
 */
const WORD: Record<AttentionBucket, { text: string; min: number; fallbacks?: string[] }> = {
  late: { text: `${CHIP['STILL OPEN'].icon} ${BUCKET_LABEL.late}`, min: 24 },
  action_required: { text: BUCKET_LABEL.action_required, min: 24 },
  requires_invoicing: { text: BUCKET_LABEL.requires_invoicing, min: 32, fallbacks: ['REQ. INVOICING'] },
};

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
                <FitText text={WORD[line.kind].text} max={42} min={WORD[line.kind].min} fallbacks={WORD[line.kind].fallbacks} className="bold caps" style={{ textAlign: 'center' }} />
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
