/** Counts strip: Jobber's own buckets in Jobber's words (decision 3) plus UNANSWERED (decision 18). */
import { BUCKETS, BUCKET_LABEL, CHIP, type Bucket } from '@sealtech/domain';
import { useBoard } from '../context';

const SHOWN = BUCKETS.filter((b): b is Exclude<Bucket, 'archived'> => b !== 'archived');
const RED_WHEN_POSITIVE: ReadonlySet<Bucket> = new Set(['late', 'action_required']);

/**
 * Jobber's words as printed. Two-word labels break at the space when the box is narrow; a single long
 * word carries a soft hyphen as the last resort before clipping (it only shows when the word cannot fit);
 * ON HOLD keeps its space unbreakable because the box always has room for it.
 */
const PRINTED: Record<string, string> = {
  UNSCHEDULED: 'UNSCHED­ULED',
  UPCOMING: 'UPCOM­ING',
  'ON HOLD': 'ON HOLD',
  UNANSWERED: 'UNAN­SWERED',
};
const printed = (label: string): string => PRINTED[label] ?? label;

export function CountsStrip() {
  const { snapshot, go } = useBoard();
  const c = snapshot.counts;
  return (
    <section className="counts zone" data-testid="counts" aria-label="job counts by stage">
      {SHOWN.map((b) => {
        const n = c[b];
        const red = RED_WHEN_POSITIVE.has(b) && n > 0;
        // Two-word labels give way first (they wrap at the space); single words keep their width.
        const twoWords = BUCKET_LABEL[b].includes(' ') && b !== 'on_hold';
        return (
          <button
            key={b}
            type="button"
            className={`count-box ${twoWords ? 'count-box--two-words' : ''}`}
            data-testid={`counts-${b}`}
            aria-label={`${BUCKET_LABEL[b]} ${n}: open stages`}
            onClick={() => go('stages', `counts:${b}`)}
          >
            <span className="count-box__label tier-d caps" data-testid={`counts-label-${b}`}>
              {printed(BUCKET_LABEL[b])}
            </span>
            {/* Red means act now: the number carries the ⚠ icon under its bucket word (decision 27). */}
            <span className={`count-box__num tier-c bold ${red ? 'act' : ''}`} data-testid={`counts-num-${b}`}>
              {red && (
                <span className="count-box__icon" aria-label="act now">
                  {CHIP['STILL OPEN'].icon}
                </span>
              )}
              {n}
            </span>
          </button>
        );
      })}
      <button type="button" className="count-box count-box--unanswered" data-testid="counts-unanswered" aria-label={`UNANSWERED ${c.unanswered}: open stages`} onClick={() => go('stages', 'counts:unanswered')}>
        <span className="count-box__label tier-d caps" data-testid="counts-label-unanswered">
          {printed('UNANSWERED')}
        </span>
        <span className="count-box__num tier-c bold">{c.unanswered}</span>
        <span className="count-box__unknown tier-d muted" data-testid="counts-unknown">
          {snapshot.unansweredUnknown > 0 ? `+${snapshot.unansweredUnknown} unknown` : ' '}
        </span>
      </button>
    </section>
  );
}
