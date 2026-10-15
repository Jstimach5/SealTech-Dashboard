/** CANNOT INVOICE, the full list: every line with its reason, owner, tags and the five stage clocks (decisions 30, 31). */
import { useState } from 'react';
import { STAGES, ownerText, type CannotInvoiceLine, type Stage } from '@sealtech/domain';
import { useBoard } from '../context';
import { dayMonth, splitLabel } from '../lib/format';
import { BigNumber } from '../ui/BigNumber';
import { Button } from '../ui/Button';
import { Tag } from '../ui/Tag';

const PAGE = 8;
const STAGE_WORD: Record<Stage, string> = { completed: 'done', first_review: '1st', second_review: '2nd', submitted: 'sent', accepted: 'ok' };
const DAYS_COLOUR: Record<CannotInvoiceLine['colour'], string> = { none: 'var(--ink)', amber: 'var(--amber-text)', red: 'var(--act)', grey: 'var(--grey-text)' };

export function CannotInvoice() {
  const { snapshot, go } = useBoard();
  const [page, setPage] = useState(0);
  const lines = snapshot.cannotInvoice;
  const pages = Math.max(1, Math.ceil(lines.length / PAGE));
  const p = Math.min(page, pages - 1);
  const slice = lines.slice(p * PAGE, p * PAGE + PAGE);
  const h = snapshot.hero;
  return (
    <main className="screen cannot" data-testid="screen-cannot-invoice">
      <div className="screen__bar cannot__bar">
        <div className="cannot__hero">
          <BigNumber value={h.cannotInvoice} tier="b" tone="brand" testId="cannot-hero" />
          <div className="cannot__hero-words">
            <span className="tier-d caps bold brand">Cannot invoice</span>
            <span className="tier-d muted">
              oldest <b>{h.oldestDays} d</b> · median <b>{h.medianDays} d</b> · not yet ready <b>{h.visitsNotReady}</b> · 1st <b>{h.reviewQueue.pass1}</b> · 2nd <b>{h.reviewQueue.pass2}</b> · FIX{' '}
              <b>{h.reviewQueue.fix}</b> · HOLD <b>{h.reviewQueue.hold}</b>
            </span>
          </div>
        </div>
        <div className="cannot__paging">
          <span className="tier-d muted" data-testid="cannot-page">
            {lines.length === 0 ? 'nothing waiting' : `${p * PAGE + 1}–${Math.min(lines.length, (p + 1) * PAGE)} of ${lines.length}`}
          </span>
          <Button label="previous page" small tone="quiet" testId="cannot-prev" disabled={p === 0} onClick={() => setPage(p - 1)}>
            ‹ prev
          </Button>
          <Button label="next page" small tone="quiet" testId="cannot-next" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
            next ›
          </Button>
          <Button label="back to today" small tone="quiet" onClick={() => go('today', 'cannot-invoice:back')}>
            ← TODAY
          </Button>
        </div>
      </div>
      <div className="cannot__rows">
        {slice.map((line) => (
          <CannotRow key={line.jobId} line={line} />
        ))}
      </div>
    </main>
  );
}

function CannotRow({ line }: { line: CannotInvoiceLine }) {
  const { lastName, city, scope } = splitLabel(line.label);
  const wait = line.reason === 'PROGRAM-WAIT';
  return (
    <div className={`cannot-row ${line.hardRed ? 'cannot-row--hard' : ''} ${wait ? 'cannot-row--wait' : ''}`} data-testid={`cannot-row-${line.jobId}`}>
      <div className="cannot-row__top tier-c">
        <b className="cannot-row__days" style={{ color: DAYS_COLOUR[line.colour] }}>
          {line.daysSinceCompleted} d
        </b>
        <span className="muted">·</span>
        <b>{lastName}</b>
        {city && (
          <>
            <span className="muted">·</span>
            <span className="ellipsis cannot-row__city">{city}</span>
          </>
        )}
        {scope && (
          <>
            <span className="muted">·</span>
            <span>{scope}</span>
          </>
        )}
        <span className="muted">·</span>
        <span className={`cannot-row__reason ${wait ? 'muted' : ''}`}>{line.reason}</span>
        {line.fixPick && <span className="tier-d muted ellipsis cannot-row__fix">{line.fixPick}</span>}
        <span className="muted">·</span>
        <span>{ownerText(line.owner)}</span>
        {line.tags.map((t) => (
          <Tag key={t} text={t} tone={t === 'NO-REMINDER' ? 'act' : 'amber'} />
        ))}
      </div>
      <div className="cannot-row__clocks tier-d muted">
        {STAGES.map((s, i) => {
          const at = line.clocks[s];
          return (
            <span key={s} className={`cannot-row__clock ${line.openStage === s ? 'cannot-row__clock--open' : ''}`}>
              {i > 0 && <span className="cannot-row__sep">›</span>}
              <span>{STAGE_WORD[s]}</span> <b className={at ? 'footer__ink' : ''}>{at ? dayMonth(at) : '—'}</b>
            </span>
          );
        })}
        {line.needBy && (
          <span className="cannot-row__clock">
            <span className="cannot-row__sep">·</span> need by <b>{line.needBy}</b>
          </span>
        )}
      </div>
    </div>
  );
}
