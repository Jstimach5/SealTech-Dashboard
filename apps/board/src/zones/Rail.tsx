/** CANNOT INVOICE rail: the hero number (decision 32), visits not yet READY, the review queue, the oldest lines. */
import { useLayoutEffect, useRef, useState } from 'react';
import { CONFIG, ownerText, type CannotInvoiceLine } from '@sealtech/domain';
import { useBoard } from '../context';
import { splitLabel } from '../lib/format';
import { BigNumber } from '../ui/BigNumber';
import { Tag } from '../ui/Tag';
import { useZoneSize } from '../ui/useFitRows';

const NAME_MAX = 42;
const NAME_MIN = 24;

export const DAYS_COLOUR: Record<CannotInvoiceLine['colour'], string> = {
  none: 'var(--ink)',
  amber: 'var(--amber-text)',
  red: 'var(--act)',
  grey: 'var(--grey-text)',
};

/** Decision 27: red never stands alone. Red day counts carry ⚠; hard-red lines carry the word too. */
export const RED_ICON = '⚠';
export const HARD_RED_TAG = `${RED_ICON} ${CONFIG.HARD_RED_DAYS}+ d UNSUBMITTED`;

export function lineTags(line: CannotInvoiceLine): JSX.Element[] {
  const tags = line.tags.map((t) => <Tag key={t} text={t} tone={t === 'NO-REMINDER' ? 'act' : 'amber'} />);
  if (line.hardRed) tags.push(<Tag key="hard-red" text={HARD_RED_TAG} tone="act" keepCase testId={`hard-red-${line.jobId}`} />);
  return tags;
}

export function Rail() {
  const { snapshot, go } = useBoard();
  const ref = useRef<HTMLDivElement>(null);
  const { height } = useZoneSize(ref);
  const lines = snapshot.cannotInvoice;
  const max = Math.min(lines.length, CONFIG.MAX_RAIL_ROWS);
  const key = `${lines.map((l) => `${l.jobId}:${l.reason}:${l.fixPick ?? ''}:${l.daysSinceCompleted}:${l.tags.join(',')}:${l.hardRed}`).join('|')}#${height}`;
  // Rows are as tall as their words need; whole rows show while they fit, the rest become `+N more`.
  const [fit, setFit] = useState({ key, shown: max });
  const [check, setCheck] = useState(0);
  const shown = fit.key === key ? fit.shown : max;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (fit.key !== key) {
      setFit({ key, shown: max });
      return;
    }
    if (shown > 0 && el.scrollHeight > el.clientHeight + 1) setFit({ key, shown: shown - 1 });
  }, [fit, key, max, shown, check]);
  // A row that re-lays itself out (city/scope placement, name size) asks for another check.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCheck((n) => n + 1));
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [shown, key]);
  const hidden = lines.length - shown;
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

/**
 * Line 1: days · NAME · CITY (whole, up to 10 characters) · SCOPE. When that does not fit, the
 * scope moves to the start of line 2; when the name still does not fit it shrinks to tier D.
 * Line 2 wraps: reason · FIX pick · owner, then the tags.
 */
function RailRow({ line }: { line: CannotInvoiceLine }) {
  const { lastName, city, scope } = splitLabel(line.label);
  const programWait = line.reason === 'PROGRAM-WAIT';
  const red = line.colour === 'red';
  const reason = line.fixPick ? `${line.reason} · ${line.fixPick}` : line.reason;
  const owner = ownerText(line.owner);
  const nameRef = useRef<HTMLElement>(null);
  const key = `${lastName}|${city}|${scope}|${line.daysSinceCompleted}|${red}`;
  const [fit, setFit] = useState({ key, scopeTop: true, nameSize: NAME_MAX });
  const current = fit.key === key ? fit : { key, scopeTop: true, nameSize: NAME_MAX };
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    if (fit !== current) {
      setFit(current);
      return;
    }
    const cut = el.scrollWidth > el.clientWidth + 1;
    if (!cut) return;
    if (current.scopeTop && scope) setFit({ ...current, scopeTop: false });
    else if (current.nameSize > NAME_MIN) setFit({ ...current, nameSize: Math.max(NAME_MIN, Math.floor((current.nameSize * el.clientWidth) / el.scrollWidth)) });
  });
  useLayoutEffect(() => {
    let alive = true;
    void document.fonts?.ready?.then(() => {
      if (alive) setFit((f) => ({ ...f, key: `${f.key}~` }));
    });
    return () => {
      alive = false;
    };
  }, []);
  const scopeOnTop = current.scopeTop || !scope;
  return (
    <div
      className={`rail-row ${line.hardRed ? 'rail-row--hard' : ''} ${programWait ? 'rail-row--wait' : ''}`}
      data-testid={`rail-row-${line.jobId}`}
      data-reason={line.reason}
      data-hard-red={line.hardRed ? 'true' : 'false'}
      data-scope-line={scopeOnTop ? '1' : '2'}
    >
      <div className="rail-row__top">
        <b className="rail-row__days tier-c" style={{ color: DAYS_COLOUR[line.colour] }} data-testid="rail-days">
          {red && (
            <span className="rail-row__icon" aria-label="act now">
              {RED_ICON}
            </span>
          )}
          {line.daysSinceCompleted} d
        </b>
        <b className="rail-row__name" ref={nameRef} style={{ fontSize: `${current.nameSize}px` }}>
          {lastName}
        </b>
        {city && (
          <span className="rail-row__city tier-d muted" data-testid="rail-city">
            {city}
          </span>
        )}
        {scope && scopeOnTop && (
          <span className="rail-row__scope tier-d muted">
            {city && <span className="sep">·</span>}
            {scope}
          </span>
        )}
      </div>
      <div className="rail-row__bottom tier-d">
        {scope && !scopeOnTop && (
          <span className="rail-row__scope muted nowrap">
            {scope}
            <span className="sep">·</span>
          </span>
        )}
        <span className="rail-row__reason" data-testid="rail-reason">
          {reason}
        </span>
        <span className="rail-row__owner nowrap">
          <span className="sep">·</span>
          {owner}
        </span>
        {lineTags(line)}
      </div>
    </div>
  );
}
