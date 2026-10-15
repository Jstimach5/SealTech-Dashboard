/**
 * TODAY (revision G). On the wall (≥ 1900×1060 CSS px, or `?wall=1`): the answer line, the Needs-you
 * ledger, the Requires-invoicing table, the crew rows and the meta line at fixed positions on the
 * 1920×1080 page. Anywhere smaller: the same content as a responsive list with band headings.
 * Every word comes from @sealtech/domain via useWallData; this file only lays it out.
 */
import { useEffect, useState } from 'react';
import { BAND_LABEL, type CrewRow, type LedgerRow } from '@sealtech/domain';
import { SCREEN_TITLE, useBoard, type Screen } from '../context';
import { useWallData, type WallData } from '../lib/wallData';
import { Icon } from '../ui/Icon';

const TABS: Screen[] = ['today', 'stages', 'cannot-invoice', 'review', 'scorecard'];
const NAV_MS = 10_000;

function Nav({ className }: { className: string }) {
  const { screen, go } = useBoard();
  return (
    <nav className={className} aria-label="screens">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          className={`navtab ${screen === t ? 'navtab--on' : ''}`}
          data-testid={`tab-${t}`}
          aria-current={screen === t ? 'page' : undefined}
          onClick={() => go(t, `tab:${t}`)}
        >
          {SCREEN_TITLE[t]}
        </button>
      ))}
    </nav>
  );
}

function AckButton({ row, className }: { row: LedgerRow; className: string }) {
  const { requestAck, ackNotes } = useBoard();
  if (!row.visitId) return null;
  const note = ackNotes[row.visitId];
  return (
    <button
      type="button"
      className={className}
      data-testid={`ack-${row.visitId}`}
      aria-label={`ACK the Problem on ${row.who}`}
      onClick={() => requestAck(row.visitId as string)}
    >
      {note === 'queued' ? 'Queued' : note ? 'Retry' : 'ACK'}
      {note && (
        <span className="sr-only" data-testid={`ack-note-${row.visitId}`}>
          {note}
        </span>
      )}
    </button>
  );
}

const tone = (t: 'ink' | 'amber' | 'red') => (t === 'ink' ? '' : ` t-${t}`);

function LedgerRowView({ row, slot }: { row: LedgerRow; slot: number }) {
  const ring = row.ack?.overdue === true;
  return (
    <div
      className={`lrow${ring ? ' lrow--ring' : ''}`}
      style={{ top: 254 + slot * 120 }}
      data-testid={`row-${row.jobId}`}
      data-band={row.band}
      data-red={row.ageTone === 'red' || row.statusTone === 'red' ? 'true' : undefined}
    >
      <div className="lrow__who">
        <span className="lrow__name">{row.who}</span>
        {row.secondary && <span className="lrow__sec">{row.secondary}</span>}
      </div>
      <div className={`lrow__age${tone(row.ageTone)}`}>{row.age}</div>
      <div className="lrow__own">{row.owner}</div>
      <div className="lrow__l2">
        <span className={`lrow__st${tone(row.statusTone)}`}>
          <Icon name={row.icon} />
          {row.status}
        </span>
        {row.why && <span className="lrow__why">&nbsp;·&nbsp;{row.why}</span>}
      </div>
      {row.ack ? <AckButton row={row} className="lrow__ack" /> : <div className="lrow__next">{row.next}</div>}
      {!ring && <div className="lrow__hair" />}
    </div>
  );
}

function CrewRowView({ c, top }: { c: CrewRow; top: number }) {
  return (
    <div className="crow" style={{ top }} data-testid={`crew-${c.crew.leadUserId}`}>
      <div className="crow__l1">
        <span className="crow__name">{c.name}</span>
        <span className={`crow__tok${c.tokenTone === 'amber' ? ' t-amber' : ''}`}>{c.token}</span>
      </div>
      <div className="crow__l2">
        <span className={`crow__job${c.jobMuted ? ' crow__job--muted' : ''}`}>{c.job}</span>
        {c.status && (
          <span className="crow__st" aria-label={c.statusFull}>
            {c.icon && <Icon name={c.icon} />}
            {c.status}
          </span>
        )}
      </div>
    </div>
  );
}

function Wall({ d }: { d: WallData }) {
  const { go, error } = useBoard();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (!navOpen) return;
    const t = window.setTimeout(() => setNavOpen(false), NAV_MS);
    return () => window.clearTimeout(t);
  }, [navOpen]);
  const nCrew = Math.max(2, d.crews.length);
  const z4top = 974 - nCrew * 104;
  return (
    <main className="wall" data-testid="screen-today" data-layout="wall">
      {d.stale && <div className="w-stalebar" data-testid="stale-bar" aria-hidden="true" />}
      <button type="button" className="w-answer" data-testid="answer" onClick={() => setNavOpen((o) => !o)} aria-label={`${d.head.text}. Tap for screens.`}>
        <span className="w-answer__text">{d.head.text}</span>
      </button>
      {navOpen ? (
        <Nav className="w-nav" />
      ) : (
        <div className="w-l2">
          <span className="w-focus" data-testid="focus-line">
            {d.focus ? `Focus: ${d.focus}` : ''}
          </span>
          <span className={`w-win${d.stale ? ' t-amber w-win--stale' : ''}`} data-testid={d.stale ? 'stale-banner' : 'win-line'}>
            {d.right}
          </span>
        </div>
      )}
      <div className="w-z2head">
        <span className="w-z2head__lab">Needs you</span>
        <span className="w-z2head__kept" data-testid="kept-line">
          {d.kept}
        </span>
      </div>
      <section className="w-ledger" data-testid="ledger" aria-label="Needs you">
        {d.visible.map((r, i) => (
          <LedgerRowView key={r.key} row={r} slot={i} />
        ))}
        {d.names && (
          <div className="w-names" style={{ top: 254 + 5 * 120 }} data-testid="names-line">
            {d.names}
          </div>
        )}
        {d.rows.length === 0 && (
          <div className="w-empty" data-testid="ledger-empty">
            No open items for the office
          </div>
        )}
      </section>
      <button
        type="button"
        className="w-money"
        style={{ height: z4top - 24 - 214 }}
        data-testid="money"
        onClick={() => go('cannot-invoice', 'money')}
        aria-label="Requires invoicing: open Cannot invoice"
      >
        <span className="w-money__lab">Requires invoicing</span>
        <span className="w-hero">
          <span className="w-hero__n" data-testid="hero">
            {d.hero}
          </span>
          <span className="w-hero__u">{d.hero === 1 ? 'job' : 'jobs'}</span>
        </span>
        {d.money.slice(0, d.moneyShown).map((m, i) => (
          <span key={m.key} className="w-mline" style={{ top: 168 + i * 48 }} data-testid={`money-${m.key}`}>
            <span className={`w-mline__l${tone(m.tone)}`}>{m.label}</span>
            <span className="w-mline__c">{m.count}</span>
          </span>
        ))}
      </button>
      <section className="w-crews" aria-label="Crews">
        {d.crews.map((c, i) => (
          <CrewRowView key={c.crew.leadUserId} c={c} top={z4top + i * 104} />
        ))}
      </section>
      <footer className="w-meta" data-testid="meta-line">
        {error ? (
          <span className="t-amber" data-testid="snapshot-error" title={error}>
            Last poll failed · {error}
          </span>
        ) : (
          d.meta
        )}
      </footer>
    </main>
  );
}

function Compact({ d }: { d: WallData }) {
  const { go, error } = useBoard();
  const bands: Array<{ title: string; rows: LedgerRow[] }> = [
    { title: BAND_LABEL.critical, rows: d.rows.filter((r) => r.band !== 'today') },
    { title: BAND_LABEL.today, rows: d.rows.filter((r) => r.band === 'today') },
  ];
  return (
    <main className="compact" data-testid="screen-today" data-layout="compact">
      <Nav className="c-nav" />
      <header className="c-head">
        <h1 className="c-answer" data-testid="answer">
          {d.head.text}
        </h1>
        <p className={`c-meta${d.stale ? ' t-amber' : ''}`} data-testid={d.stale ? 'stale-banner' : 'win-line'}>
          {d.right}
        </p>
        {d.focus && (
          <p className="c-meta" data-testid="focus-line">
            Focus: {d.focus}
          </p>
        )}
      </header>
      <div className="c-grid">
        <section className="c-ledger" data-testid="ledger" aria-label="Needs you">
          <h2 className="c-h2">
            Needs you <span className="c-sub">{d.kept}</span>
          </h2>
          {d.rows.length === 0 && <p className="c-empty">No open items for the office</p>}
          {bands.map((b) =>
            b.rows.length === 0 ? null : (
              <div key={b.title} className="c-band">
                <h3 className="c-h3">{b.title}</h3>
                {b.rows.map((r) => (
                  <div key={r.key} className={`c-row${r.ack?.overdue ? ' c-row--ring' : ''}`} data-testid={`row-${r.jobId}`} data-band={r.band}>
                    <div className="c-row__1">
                      <span className="c-row__who">
                        {r.who}
                        {r.secondary && <span className="c-sub"> {r.secondary}</span>}
                      </span>
                      <span className={`c-row__age${tone(r.ageTone)}`}>{r.age}</span>
                    </div>
                    <div className={`c-row__2${tone(r.statusTone)}`}>
                      <Icon name={r.icon} />
                      <span>
                        {r.status}
                        {r.why ? ` · ${r.why}` : ''}
                      </span>
                    </div>
                    <div className="c-row__3">
                      <b>{r.owner}</b> {r.ack ? '' : r.next}
                    </div>
                    {r.ack && <AckButton row={r} className="c-ack" />}
                  </div>
                ))}
              </div>
            ),
          )}
        </section>
        <aside className="c-side">
          <button type="button" className="c-money" data-testid="money" onClick={() => go('cannot-invoice', 'money')}>
            <span className="c-h2">Requires invoicing</span>
            <span className="c-hero">
              <span data-testid="hero">{d.hero}</span> <span className="c-sub">{d.hero === 1 ? 'job' : 'jobs'}</span>
            </span>
            {d.money.map((m) => (
              <span key={m.key} className="c-mline" data-testid={`money-${m.key}`}>
                <span className={tone(m.tone)}>{m.label}</span>
                <b>{m.count}</b>
              </span>
            ))}
          </button>
          <section aria-label="Crews" className="c-crews">
            <h2 className="c-h2">Crews</h2>
            {d.crews.map((c) => (
              <div key={c.crew.leadUserId} className="c-crew" data-testid={`crew-${c.crew.leadUserId}`}>
                <div className="c-crew__1">
                  <b>{c.name} crew</b>
                  <span className={c.tokenTone === 'amber' ? 't-amber' : 'c-sub'}>{c.token}</span>
                </div>
                <div className="c-crew__2">
                  <span>{c.job}</span>
                  <span className="c-crew__st">
                    {c.icon && <Icon name={c.icon} />}
                    {c.statusFull}
                  </span>
                </div>
              </div>
            ))}
          </section>
        </aside>
      </div>
      <footer className="c-foot" data-testid="meta-line">
        {error && (
          <span className="t-amber" data-testid="snapshot-error">
            Last poll failed · {error}{' · '}
          </span>
        )}
        {d.meta}
      </footer>
    </main>
  );
}

export function Today({ layout }: { layout: 'wall' | 'compact' }) {
  const d = useWallData();
  return layout === 'wall' ? <Wall d={d} /> : <Compact d={d} />;
}
