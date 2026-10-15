/** STAGES: seven columns in Jobber's bucket order and words (decision 3); the WIP cap line; the ≥ 20 d unsubmitted filter. */
import { useMemo, useRef, useState } from 'react';
import { BUCKETS, BUCKET_LABEL, CHIP, CONFIG, toDate, type Bucket, type Job } from '@sealtech/domain';
import { useBoard } from '../context';
import { Button } from '../ui/Button';
import { FitText } from '../ui/FitText';
import { clipRows, useFitRows } from '../ui/useFitRows';

const COLUMNS = BUCKETS.filter((b): b is Exclude<Bucket, 'archived'> => b !== 'archived');
const ROW = 76;
const GAP = 6;
const MAX_ROWS = 8;

export function Stages() {
  const { snapshot, go } = useBoard();
  const [hardOnly, setHardOnly] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const hardRed = useMemo(() => new Set(snapshot.cannotInvoice.filter((l) => l.hardRed).map((l) => l.jobId)), [snapshot.cannotInvoice]);
  const byBucket = useMemo(() => {
    const m = new Map<Bucket, Job[]>();
    for (const job of snapshot.jobs) {
      if (job.bucket === 'archived') continue;
      if (hardOnly && !hardRed.has(job.id)) continue;
      const list = m.get(job.bucket) ?? [];
      list.push(job);
      m.set(job.bucket, list);
    }
    for (const list of m.values()) list.sort((a, b) => toDate(a.bucketSince).getTime() - toDate(b.bucketSince).getTime());
    return m;
  }, [snapshot.jobs, hardOnly, hardRed]);
  const over = snapshot.packagesOpen > CONFIG.WIP_CAP;
  return (
    <main className="screen stages" data-testid="screen-stages">
      <div className="screen__bar">
        <span className={`tier-c bold ${over ? 'act' : 'brand'}`} data-testid="packages-open">
          Packages open {snapshot.packagesOpen} / cap {CONFIG.WIP_CAP}
        </span>
        <Button label={`filter: unsubmitted ${CONFIG.HARD_RED_DAYS} days or more`} small selected={hardOnly} testId="toggle-hard-red" onClick={() => setHardOnly((v) => !v)}>
          unsubmitted ≥ {CONFIG.HARD_RED_DAYS} d{hardOnly ? ' · on' : ''}
        </Button>
        <Button label="back to today" small tone="quiet" onClick={() => go('today', 'stages:back')}>
          ← TODAY
        </Button>
      </div>
      <div className="stages__cols">
        {COLUMNS.map((b) => (
          <StageColumn
            key={b}
            bucket={b}
            count={hardOnly ? (byBucket.get(b)?.length ?? 0) : snapshot.counts[b]}
            jobs={byBucket.get(b) ?? []}
            collapsed={b === 'on_hold' && !holdOpen}
            onReveal={b === 'on_hold' ? () => setHoldOpen(true) : undefined}
            hardRed={hardRed}
          />
        ))}
      </div>
    </main>
  );
}

function StageColumn({
  bucket,
  count,
  jobs,
  collapsed,
  onReveal,
  hardRed,
}: {
  bucket: Bucket;
  count: number;
  jobs: Job[];
  collapsed: boolean;
  onReveal: (() => void) | undefined;
  hardRed: Set<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fits = useFitRows(ref, ROW, GAP);
  const { shown, hidden } = clipRows(jobs.length, fits, MAX_ROWS);
  const red = (bucket === 'late' || bucket === 'action_required') && count > 0;
  return (
    <section className="stage-col" data-testid={`stage-col-${bucket}`} aria-label={`${BUCKET_LABEL[bucket]} ${count}`}>
      <header className="stage-col__head">
        <span className="tier-d caps bold muted stage-col__label">{BUCKET_LABEL[bucket]}</span>
        <span className={`tier-c bold ${red ? 'act' : ''}`} data-testid={`stage-count-${bucket}`}>
          {red ? `${CHIP.LATE.icon} ${count}` : count}
        </span>
      </header>
      <div className="stage-col__rows" ref={ref}>
        {collapsed ? (
          <Button label={`show the ${count} on hold jobs`} small tone="quiet" testId="reveal-on-hold" onClick={onReveal}>
            show {count}
          </Button>
        ) : (
          <>
            {jobs.slice(0, shown).map((job) => (
              <div key={job.id} className={`stage-row ${hardRed.has(job.id) ? 'stage-row--hard' : ''}`} data-testid={`stage-row-${job.id}`}>
                <FitText text={job.lastName} max={42} min={24} className="bold stage-row__name" />
                <span className="tier-d muted stage-row__where">
                  <span className="ellipsis">{job.city}</span>
                  <span className="sep">·</span>
                  <span className="nowrap">{job.scope}</span>
                </span>
              </div>
            ))}
            {hidden > 0 && <div className="tier-d muted stage-row__more">+{hidden} more</div>}
          </>
        )}
      </div>
    </section>
  );
}
