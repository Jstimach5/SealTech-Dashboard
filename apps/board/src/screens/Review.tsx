/**
 * REVIEW (decisions 5, 7, 8, 40, 43): the signed-in reviewer's queue of Requires Invoicing jobs
 * lacking their pass, both verdicts side by side (checker + human), READY / FIX / HOLD to
 * /api/review, the unmatched rows panel, and the office tools (FLAG / FOCUS / RESPONDER).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHIP, CONFIG, FIX_PICKLIST, fileStem, localHHMM, verdictsByJob, type Job, type JobVerdicts, type ReviewRow, type Verdict } from '@sealtech/domain';
import { useBoard } from '../context';
import { api } from '../data/api';
import { dayMonth, splitLabel } from '../lib/format';
import type { Session } from '../pin/usePin';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';
import { useZoneSize } from '../ui/useFitRows';
import { Tools } from './Tools';

const OFFICE_ROLES = new Set(['office', 'owner']);
const QUEUE_CARD_W = 272;
const QUEUE_GAP = 10;
const QUEUE_ROWS = 2;

export function Review({ session }: { session: Session }) {
  const { snapshot, now, go, setSession } = useBoard();
  const pass = session.person.reviewPass;
  const verdicts = useMemo(() => verdictsByJob(snapshot.reviewRows), [snapshot.reviewRows]);
  const queue = useMemo(
    () =>
      snapshot.jobs.filter((j) => {
        if (j.bucket !== 'requires_invoicing') return false;
        const v = verdicts[j.id];
        return pass === 1 ? !(v?.pass1Ready ?? false) : pass === 2 ? !(v?.pass2Ready ?? false) : false;
      }),
    [snapshot.jobs, verdicts, pass],
  );
  const unmatched = useMemo(() => snapshot.reviewRows.filter((r) => r.match === 'none'), [snapshot.reviewRows]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [acting, setActing] = useState(false);
  const selected = queue.find((j) => j.id === selectedId) ?? queue[0];
  // The queue shows whole cards only: as many as fit in two rows, the selected one always among them, then `+N more`.
  const listRef = useRef<HTMLDivElement>(null);
  const { width: listWidth } = useZoneSize(listRef);
  const perRow = Math.max(1, Math.floor((listWidth + QUEUE_GAP) / (QUEUE_CARD_W + QUEUE_GAP)));
  const capacity = perRow * QUEUE_ROWS;
  let visible = queue;
  let hiddenCount = 0;
  if (queue.length > capacity) {
    visible = queue.slice(0, capacity - 1);
    if (selected && !visible.includes(selected)) visible = [...visible.slice(0, -1), selected];
    hiddenCount = queue.length - visible.length;
  }
  const hhmm = localHHMM(now);
  const past1 = hhmm >= CONFIG.VERDICT_CUTOFF_PASS1;
  const past2 = hhmm >= CONFIG.VERDICT_CUTOFF_PASS2;
  const office = OFFICE_ROLES.has(session.person.role);

  return (
    <main className="screen review" data-testid="screen-review">
      <div className="screen__bar">
        <span className="tier-c bold brand">REVIEW</span>
        <span className="tier-d bold">
          {session.person.lastName} <span className="muted">· {pass === 1 ? '1st pass' : pass === 2 ? '2nd pass' : 'no review pass'}</span>
          {session.demo && <Tag text="demo" tone="amber" />}
        </span>
        <span className="tier-d review__cutoffs" data-testid="cutoffs">
          <span className={past1 ? 'note--amber bold' : 'muted'}>1st by {CONFIG.VERDICT_CUTOFF_PASS1}</span>
          <span className="muted"> · </span>
          <span className={past2 ? 'note--amber bold' : 'muted'}>2nd by {CONFIG.VERDICT_CUTOFF_PASS2}</span>
        </span>
        <span className="screen__bar-spacer" />
        <Button label="lock the screen" small tone="quiet" testId="lock" onClick={() => setSession(undefined)}>
          lock 🔒
        </Button>
        <Button label="back to today" small tone="quiet" onClick={() => go('today', 'review:back')}>
          ← TODAY
        </Button>
      </div>
      <div className="review__body">
        <section className="review__queue card" aria-label="jobs waiting for your verdict">
          <header className="review__queue-head">
            <span className="tier-d caps bold muted">{pass === 0 ? 'Review queue' : `Waiting for your ${pass === 1 ? '1st' : '2nd'} pass`}</span>
            <span className="tier-d muted">{queue.length}</span>
          </header>
          {pass === 0 ? (
            <div className="note review__empty">no review pass for {session.person.lastName} · decision 5: Henry first, Jack second</div>
          ) : queue.length === 0 ? (
            <div className="note review__empty">nothing waiting · all passed</div>
          ) : (
            <div className="review__list" ref={listRef} style={acting ? { display: 'none' } : undefined} data-testid="review-queue">
              {visible.map((job) => (
                <QueueRow key={job.id} job={job} v={verdicts[job.id]} selected={job.id === selected?.id} onSelect={() => setSelectedId(job.id)} />
              ))}
              {hiddenCount > 0 && (
                <div className="review-row review-row--more tier-c muted" data-testid="review-queue-more">
                  +{hiddenCount} more
                </div>
              )}
            </div>
          )}
          {selected && pass !== 0 && <Detail key={selected.id} job={selected} v={verdicts[selected.id]} pass={pass} session={session} onActing={setActing} />}
        </section>
        <aside className="review__side">
          <section className="card review__unmatched" data-testid="unmatched" aria-label="unmatched review rows">
            <header className="review__queue-head">
              <span className="tier-d caps bold muted">Unmatched</span>
              <span className="tier-d muted">{unmatched.length}</span>
            </header>
            <div className="note">not tied to a job — no verdict shown on the wall</div>
            <div className="review__unmatched-rows">
              {unmatched.slice(0, 4).map((r) => (
                <div key={r.rowIndex} className="review__unmatched-row tier-d" data-testid={`unmatched-${r.rowIndex}`}>
                  <b className="ellipsis">{fileStem(r.application)}</b>
                  <span className="muted nowrap">
                    {r.installDate} · {r.verdict ?? '—'}
                  </span>
                </div>
              ))}
              {unmatched.length > 4 && <div className="note">+{unmatched.length - 4} more</div>}
              {unmatched.length === 0 && <div className="note">none</div>}
            </div>
          </section>
          {office && <Tools session={session} />}
        </aside>
      </div>
    </main>
  );
}

function verdictWord(row: ReviewRow | undefined): string {
  if (!row) return '—';
  return row.verdict ?? '—';
}

function QueueRow({ job, v, selected, onSelect }: { job: Job; v: JobVerdicts | undefined; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`review-row ${selected ? 'review-row--selected' : ''}`} data-testid={`review-job-${job.id}`} aria-label={`review ${job.lastName}`} aria-pressed={selected} onClick={onSelect}>
      <span className="tier-c bold ellipsis">{job.lastName}</span>
      <span className="tier-d review-row__verdicts">
        <span className="muted">checker</span> <b>{verdictWord(v?.checker)}</b>
      </span>
      <span className="tier-d review-row__verdicts">
        <span className="muted">1st</span> <b>{verdictWord(v?.pass1)}</b>
        <span className="muted"> · 2nd</span> <b>{verdictWord(v?.pass2)}</b>
      </span>
    </button>
  );
}

type Mode = 'idle' | 'fix' | 'hold';

function Detail({ job, v, pass, session, onActing }: { job: Job; v: JobVerdicts | undefined; pass: 1 | 2; session: Session; onActing: (acting: boolean) => void }) {
  const { refresh } = useBoard();
  const [mode, setModeState] = useState<Mode>('idle');
  // FIX and HOLD take the queue's room while they are open; the list comes back on cancel or save.
  const setMode = (m: Mode) => {
    setModeState(m);
    onActing(m !== 'idle');
  };
  useEffect(() => () => onActing(false), [onActing]);
  const [holdReason, setHoldReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | undefined>(undefined);
  const { city, scope } = splitLabel(`${job.lastName} · ${job.city} · ${job.scope}`);
  const pass1Ready = v?.pass1Ready ?? false;
  const readyBlocked = pass === 2 && !pass1Ready;
  const human = pass === 2 ? (v?.pass2 ?? v?.pass1) : v?.pass1;
  const latestHuman = v?.pass2 && v?.pass1 ? (v.pass2.reviewedAt ?? '') > (v.pass1.reviewedAt ?? '') ? v.pass2 : v.pass1 : (human ?? v?.pass2 ?? v?.pass1);

  useEffect(() => {
    if (status?.kind !== 'saved') return;
    const id = window.setTimeout(() => setStatus(undefined), 2000);
    return () => window.clearTimeout(id);
  }, [status]);

  const send = async (verdict: Verdict, extra: { fixPick?: string; holdReason?: string } = {}) => {
    setBusy(true);
    setStatus(undefined);
    const res = await api('/api/review', { body: { jobId: job.id, pass, verdict, ...extra }, token: session.token });
    setBusy(false);
    if (res.ok) {
      setStatus({ kind: 'saved', text: 'saved' });
      setMode('idle');
      setHoldReason('');
      refresh();
    } else setStatus({ kind: 'error', text: res.error });
  };

  return (
    <div className="review__detail" data-testid={`review-detail-${job.id}`}>
      <div className="review__detail-head">
        <span className="tier-c bold">
          {job.lastName} <span className="muted">· {city} · {scope}</span>
        </span>
        <Button
          label={job.companyCamUrl ? 'open the CompanyCam project in a new tab' : 'no CompanyCam link'}
          small
          tone="move"
          testId="companycam"
          disabled={!job.companyCamUrl}
          onClick={() => {
            if (job.companyCamUrl) window.open(job.companyCamUrl, '_blank', 'noopener');
          }}
        >
          ⧉ CompanyCam
        </Button>
      </div>
      <div className="review__verdicts">
        <VerdictCard title="Checker (overnight)" row={v?.checker} />
        <VerdictCard title={latestHuman?.pass === 2 ? 'Latest human · 2nd pass' : 'Latest human · 1st pass'} row={latestHuman} people={session.person} />
      </div>
      {mode === 'idle' && (
        <div className="review__buttons">
          <div className="review__verdict-btn">
            <button type="button" className="verdict verdict--ready" data-testid="verdict-ready" aria-label="verdict READY" disabled={busy || readyBlocked} onClick={() => void send('READY')}>
              <span className="verdict__icon" aria-hidden="true">
                {CHIP.READY.icon}
              </span>
              <span>READY</span>
            </button>
            {readyBlocked && <span className="note note--amber">needs 1st pass READY</span>}
          </div>
          <button type="button" className="verdict verdict--fix" data-testid="verdict-fix" aria-label="verdict FIX" disabled={busy} onClick={() => setMode('fix')}>
            <span className="verdict__icon" aria-hidden="true">
              {CHIP.FIX.icon}
            </span>
            <span>FIX</span>
          </button>
          <button type="button" className="verdict verdict--hold" data-testid="verdict-hold" aria-label="verdict HOLD" disabled={busy} onClick={() => setMode('hold')}>
            <span className="verdict__icon" aria-hidden="true">
              {CHIP.HOLD.icon}
            </span>
            <span>HOLD</span>
          </button>
          <span className="review__status" aria-live="polite" data-testid="review-status">
            {status && <span className={`tier-c bold ${status.kind === 'saved' ? 'note--auto' : 'note--act'}`}>{status.text}</span>}
            {busy && <span className="note">sending…</span>}
          </span>
        </div>
      )}
      {mode === 'fix' && (
        <div className="review__fix" data-testid="fix-picklist">
          <div className="review__fix-head">
            <span className="tier-d caps bold muted">FIX · what must be fixed before submitting?</span>
            <Button label="cancel FIX" small tone="quiet" onClick={() => setMode('idle')}>
              cancel
            </Button>
          </div>
          <div className="review__picklist">
            {FIX_PICKLIST.map((pick) => (
              <button key={pick} type="button" className="pick" data-testid="fix-pick" aria-label={`FIX: ${pick}`} disabled={busy} onClick={() => void send('FIX', { fixPick: pick })}>
                {pick}
              </button>
            ))}
          </div>
          {status?.kind === 'error' && <span className="note note--act">{status.text}</span>}
        </div>
      )}
      {mode === 'hold' && (
        <div className="review__hold" data-testid="hold-form">
          <div className="review__fix-head">
            <span className="tier-d caps bold muted">HOLD · why? (the owner decides)</span>
            <Button label="cancel HOLD" small tone="quiet" onClick={() => setMode('idle')}>
              cancel
            </Button>
          </div>
          <textarea className="review__textarea" aria-label="hold reason" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} rows={2} placeholder="reason" />
          <div className="review__fix-head">
            <Button label="save HOLD" tone="amber" testId="hold-save" disabled={busy || holdReason.trim() === ''} onClick={() => void send('HOLD', { holdReason: holdReason.trim() })}>
              ❚❚ save HOLD
            </Button>
            {status?.kind === 'error' && <span className="note note--act">{status.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function VerdictCard({ title, row, people }: { title: string; row: ReviewRow | undefined; people?: Session['person'] }) {
  const { snapshot } = useBoard();
  const who = row?.reviewerUserId ? (snapshot.people.find((p) => p.jobberUserId === row.reviewerUserId)?.initials ?? people?.initials ?? '') : '';
  const tone = row?.verdict === 'READY' ? 'note--auto' : row?.verdict === 'FIX' || row?.verdict === 'HOLD' ? 'note--amber' : 'muted';
  return (
    <div className="verdict-card">
      <span className="tier-d caps bold muted">{title}</span>
      <span className={`tier-c bold ${tone}`}>{row?.verdict ?? '—'}</span>
      <span className="tier-d muted ellipsis">
        {row ? [row.fixBeforeSubmitting, row.holdReason, row.reviewNotes, row.blowerDoorPrePost ? `blower ${row.blowerDoorPrePost}` : undefined].filter(Boolean).join(' · ') || 'no notes' : 'no row'}
      </span>
      <span className="tier-d muted">
        {row ? `${row.reviewedAt ? `${dayMonth(row.reviewedAt)} ${localHHMM(row.reviewedAt)}` : row.checked}${who ? ` · ${who}` : ''}${row.status ? ` · ${row.status}` : ''}` : ''}
      </span>
    </div>
  );
}
