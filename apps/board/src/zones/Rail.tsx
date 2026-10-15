/** CANNOT INVOICE rail: the hero number (decision 32), visits not yet READY, the review queue, the oldest lines. */
import { useLayoutEffect, useRef, useState } from 'react';
import { CONFIG, ownerText, type CannotInvoiceLine } from '@sealtech/domain';
import { useBoard } from '../context';
import { splitLabel } from '../lib/format';
import { BigNumber } from '../ui/BigNumber';
import { Tag } from '../ui/Tag';
import { clipRows, useFitRows } from '../ui/useFitRows';

const ROW = 128;
const GAP = 8;

const DAYS_COLOUR: Record<CannotInvoiceLine['colour'], string> = {
  none: 'var(--ink)',
  amber: 'var(--amber-text)',
  red: 'var(--act)',
  grey: 'var(--grey-text)',
};

export function Rail() {
  const { snapshot, go } = useBoard();
  const ref = useRef<HTMLDivElement>(null);
  const fits = useFitRows(ref, ROW, GAP);
  const lines = snapshot.cannotInvoice;
  const { shown, hidden } = clipRows(lines.length, fits, CONFIG.MAX_RAIL_ROWS, false);
  const q = snapshot.hero.reviewQueue;
  return (
    <button type="button" className="rail zone card" data-testid="rail" aria-label="cannot invoice: open the full list" onClick={() => go('cannot-invoice', 'rail')}>
      <div className="rail__head">
        <span className="tier-d caps bold brand">Cannot invoice</span>
        {hidden > 0 && <span className="tier-d muted">+{hidden} more</span>}
      </div>
      <BigNumber value={snapshot.hero.cannotInvoice} tier="a" tone="brand" testId="hero" />
      <div className="tier-d muted rail__line">
        oldest <b>{snapshot.hero.oldestDays} d</b> · median <b>{snapshot.hero.medianDays} d</b>
      </div>
      <div className="rail__notready" data-testid="not-ready">
        <span className="tier-d caps muted bold">NOT YET READY</span>
        <span className="tier-b rail__notready-num" data-testid="visits-not-ready">
          {snapshot.hero.visitsNotReady}
        </span>
      </div>
      <div className="tier-d muted rail__line">
        1st <b>{q.pass1}</b> · 2nd <b>{q.pass2}</b> · FIX <b>{q.fix}</b> · HOLD <b>{q.hold}</b>
      </div>
      <div className="rail__rows" ref={ref}>
        {lines.slice(0, shown).map((line) => (
          <RailRow key={line.jobId} line={line} />
        ))}
        {lines.length === 0 && <div className="tier-d muted">nothing waiting</div>}
      </div>
    </button>
  );
}

function RailRow({ line }: { line: CannotInvoiceLine }) {
  const { lastName, city, scope } = splitLabel(line.label);
  const programWait = line.reason === 'PROGRAM-WAIT';
  const reason = line.fixPick ? `${line.reason} · ${line.fixPick}` : line.reason;
  const owner = ownerText(line.owner);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // Tags sit at the end of line 2. When they would wrap off that line they move to the right end of
  // line 1 if the whole line still fits there; otherwise they stay under line 2 (the row has the height).
  const [tagsOnTop, setTagsOnTop] = useState(false);
  const tagKey = line.tags.join('|');
  useLayoutEffect(() => {
    setTagsOnTop(false);
  }, [reason, owner, tagKey]);
  useLayoutEffect(() => {
    const el = bottom.current;
    const topEl = top.current;
    if (!el || !topEl || tagsOnTop || line.tags.length === 0) return;
    const reasonEl = el.querySelector<HTMLElement>('[data-testid="rail-reason"]');
    const tagEls = Array.from(el.querySelectorAll<HTMLElement>('.tag'));
    const lastTag = tagEls[tagEls.length - 1];
    if (!reasonEl || !lastTag) return;
    const wrapped = lastTag.offsetTop > reasonEl.offsetTop + 2 || el.scrollWidth > el.clientWidth + 1;
    if (!wrapped) return;
    const tagsWidth = tagEls.reduce((w, t) => w + t.getBoundingClientRect().width + 6, 0);
    const used = Array.from(topEl.children).reduce((w, c) => w + (c as HTMLElement).scrollWidth + 10, 0);
    if (used + tagsWidth <= topEl.clientWidth) setTagsOnTop(true);
  }, [reason, owner, tagKey, tagsOnTop, line.tags.length]);
  const tags = line.tags.map((t) => <Tag key={t} text={t} tone={t === 'NO-REMINDER' ? 'act' : 'amber'} />);
  return (
    <div
      className={`rail-row ${line.hardRed ? 'rail-row--hard' : ''} ${programWait ? 'rail-row--wait' : ''}`}
      data-testid={`rail-row-${line.jobId}`}
      data-reason={line.reason}
      data-hard-red={line.hardRed ? 'true' : 'false'}
    >
      <div className="rail-row__top" ref={top}>
        <b className="rail-row__days tier-c" style={{ color: DAYS_COLOUR[line.colour] }}>
          {line.daysSinceCompleted} d
        </b>
        <b className="rail-row__name tier-c">{lastName}</b>
        <span className="rail-row__where tier-d muted">
          <span className="rail-row__city ellipsis">{city}</span>
          {city && scope ? <span className="sep">·</span> : null}
          <span className="rail-row__scope">{scope}</span>
        </span>
        {tagsOnTop && <span className="rail-row__tags">{tags}</span>}
      </div>
      <div className="rail-row__bottom tier-d" ref={bottom}>
        <span className="rail-row__reason" data-testid="rail-reason">
          {reason}
        </span>
        <span className="sep">·</span>
        <span className="rail-row__owner">{owner}</span>
        {!tagsOnTop && tags}
      </div>
    </div>
  );
}
