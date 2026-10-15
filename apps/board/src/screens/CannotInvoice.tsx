/**
 * CANNOT INVOICE, the full list: every line with its reason, owner, tags and the five stage clocks
 * (decisions 30, 31), and the huddle owner override (decision 33): OWNER → office/owner PIN → initials
 * → POST /api/owner. FIX and HOLD lines keep their role word, so they offer no OWNER control.
 */
import { useState } from 'react';
import { STAGES, ownerText, type CannotInvoiceLine, type Stage } from '@sealtech/domain';
import { useBoard } from '../context';
import { api, postTap } from '../data/api';
import { dayMonth, splitLabel } from '../lib/format';
import { BigNumber } from '../ui/BigNumber';
import { Button } from '../ui/Button';
import { DAYS_COLOUR, RED_ICON, lineTags } from '../zones/Rail';
import { PinGate } from './PinGate';

const PAGE = 8;
/** Decision 31's stage words as printed on the wall. */
const STAGE_WORD: Record<Stage, string> = { completed: 'done', first_review: '1st', second_review: '2nd', submitted: 'submitted', accepted: 'accepted' };
const OFFICE_ROLES: ReadonlySet<string> = new Set(['office', 'owner']);
const INITIALS = /^[A-Z]{2,3}$/;

/** Decision 33: FIX and HOLD lines show a role word that the huddle does not change. */
export function ownerChangeable(line: CannotInvoiceLine): boolean {
  return line.reason !== 'FIX OPEN' && line.reason !== 'HOLD';
}

type Note = { ok: boolean; text: string };

export function CannotInvoice() {
  const { snapshot, go, session, setSession, refresh } = useBoard();
  const [page, setPage] = useState(0);
  const [ownerFor, setOwnerFor] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [busy, setBusy] = useState(false);
  const lines = snapshot.cannotInvoice;
  const pages = Math.max(1, Math.ceil(lines.length / PAGE));
  const p = Math.min(page, pages - 1);
  const slice = lines.slice(p * PAGE, p * PAGE + PAGE);
  const h = snapshot.hero;
  const picking = ownerFor !== undefined ? lines.find((l) => l.jobId === ownerFor) : undefined;
  const officeSession = session !== undefined && OFFICE_ROLES.has(session.person.role);

  const closePick = () => {
    setOwnerFor(undefined);
    setSession(undefined);
  };

  if (picking && !officeSession) {
    return <PinGate title="OWNER" testId="screen-owner-pin" roles={OFFICE_ROLES} onCancel={closePick} cancelLabel="back to the list" />;
  }

  const pickOwner = async (line: CannotInvoiceLine, initials: string) => {
    if (!session) return;
    setBusy(true);
    const res = await api('/api/owner', { body: { jobId: line.jobId, initials }, token: session.token });
    setBusy(false);
    setNotes((n) => ({ ...n, [line.jobId]: res.ok ? { ok: true, text: `owner ${initials} · saved` } : { ok: false, text: res.error } }));
    // The pick is one write: the session ends with it, whatever the answer.
    closePick();
    if (res.ok) refresh();
  };

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
          <Button label="previous page" small tone="quiet" testId="cannot-prev" disabled={p === 0 || picking !== undefined} onClick={() => setPage(p - 1)}>
            ‹ prev
          </Button>
          <Button label="next page" small tone="quiet" testId="cannot-next" disabled={p >= pages - 1 || picking !== undefined} onClick={() => setPage(p + 1)}>
            next ›
          </Button>
          <Button label="back to today" small tone="quiet" onClick={() => go('today', 'cannot-invoice:back')}>
            ← TODAY
          </Button>
        </div>
      </div>
      {picking ? (
        <OwnerPicker line={picking} busy={busy} onPick={(initials) => void pickOwner(picking, initials)} onCancel={closePick} />
      ) : (
        <div className="cannot__rows">
          {slice.map((line) => (
            <CannotRow
              key={line.jobId}
              line={line}
              note={notes[line.jobId]}
              onOwner={() => {
                postTap('cannot-invoice', `owner:${line.jobId}`);
                setNotes((n) => {
                  const { [line.jobId]: _old, ...rest } = n;
                  return rest;
                });
                setOwnerFor(line.jobId);
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function OwnerPicker({ line, busy, onPick, onCancel }: { line: CannotInvoiceLine; busy: boolean; onPick: (initials: string) => void; onCancel: () => void }) {
  const { snapshot } = useBoard();
  const { lastName } = splitLabel(line.label);
  const people = snapshot.people.filter((p) => INITIALS.test(p.initials));
  return (
    <section className="card owner-pick" data-testid="owner-picker" aria-label={`owner for ${lastName}`}>
      <div className="owner-pick__head">
        <span className="tier-c bold">
          OWNER · {lastName} <span className="muted">· now {ownerText(line.owner)}</span>
        </span>
        <span className="tier-d muted">{line.reason} · who moves it next?</span>
        <span className="screen__bar-spacer" />
        <Button label="cancel the owner change" small tone="quiet" testId="owner-cancel" onClick={onCancel}>
          cancel
        </Button>
      </div>
      <div className="tool__tiles owner-pick__tiles">
        {people.map((p) => (
          <Button key={p.jobberUserId} label={`owner ${p.lastName}`} testId={`owner-pick-${p.initials}`} disabled={busy} selected={ownerText(line.owner) === p.initials} onClick={() => onPick(p.initials)}>
            {p.initials} <span className="tier-d muted owner-pick__name">· {p.lastName}</span>
          </Button>
        ))}
      </div>
      {busy && <span className="note">sending…</span>}
    </section>
  );
}

function CannotRow({ line, note, onOwner }: { line: CannotInvoiceLine; note: Note | undefined; onOwner: () => void }) {
  const { lastName, city, scope } = splitLabel(line.label);
  const wait = line.reason === 'PROGRAM-WAIT';
  const red = line.colour === 'red';
  return (
    <div className={`cannot-row ${line.hardRed ? 'cannot-row--hard' : ''} ${wait ? 'cannot-row--wait' : ''}`} data-testid={`cannot-row-${line.jobId}`}>
      <div className="cannot-row__main">
        <div className="cannot-row__top tier-c">
          <b className="cannot-row__days" style={{ color: DAYS_COLOUR[line.colour] }}>
            {red && (
              <span className="rail-row__icon" aria-label="act now">
                {RED_ICON}
              </span>
            )}
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
          {line.fixPick && <span className="tier-d muted cannot-row__fix">{line.fixPick}</span>}
          <span className="muted">·</span>
          <span data-testid={`cannot-owner-${line.jobId}`}>{ownerText(line.owner)}</span>
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
          <span className="cannot-row__tags">{lineTags(line)}</span>
        </div>
      </div>
      <div className="cannot-row__side">
        {note && (
          <span className={`tier-d ${note.ok ? 'note--auto' : 'note--act'} cannot-row__note`} data-testid={`owner-note-${line.jobId}`}>
            {note.text}
          </span>
        )}
        {ownerChangeable(line) && (
          <Button label={`change the owner of ${lastName}`} small tone="quiet" testId={`owner-${line.jobId}`} onClick={onOwner}>
            OWNER
          </Button>
        )}
      </div>
    </div>
  );
}
