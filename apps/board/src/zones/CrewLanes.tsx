/** Crew lanes: one column per crew with a visit today; the NOW card large, NEXT rows, a DONE line, TOMORROW after 15:00. */
import { useRef, type ReactNode } from 'react';
import { CONFIG, localHHMM } from '@sealtech/domain';
import { useBoard } from '../context';
import { timeRange } from '../lib/format';
import { deriveLanes, type Lane, type LaneCard } from '../lib/lanes';
import { Chip } from '../ui/Chip';
import { FitText } from '../ui/FitText';
import { clipRows, fitRows, useZoneHeight } from '../ui/useFitRows';

const ROW = 44;
const GAP = 4;
const TOMORROW_ROW = 64;

export function CrewLanes() {
  const { snapshot, now } = useBoard();
  const { lanes, overflow, afterFlip } = deriveLanes(snapshot, now);
  const style = { gridTemplateColumns: `repeat(${Math.max(1, lanes.length)}, minmax(0, 1fr))${overflow.length > 0 ? ' 72px' : ''}` };
  return (
    <section className="lanes zone" data-testid="lanes" aria-label="crew lanes" style={style}>
      {lanes.map((lane) => (
        <LaneColumn key={lane.crew.leadUserId} lane={lane} afterFlip={afterFlip} />
      ))}
      {lanes.length === 0 && <div className="lanes__empty tier-c muted">no visits today</div>}
      {overflow.length > 0 && (
        <div className="lanes__more" data-testid="lanes-overflow" aria-label={`${overflow.length} more crew`}>
          <span className="tier-c bold">+{overflow.length} </span>
          <span className="tier-d caps">crew</span>
        </div>
      )}
    </section>
  );
}

function LaneColumn({ lane, afterFlip }: { lane: Lane; afterFlip: boolean }) {
  const { snapshot } = useBoard();
  const rowsRef = useRef<HTMLDivElement>(null);
  const height = useZoneHeight(rowsRef);
  // After the flip hour the TOMORROW row is pinned last, with or without a visit, when there is room for it.
  const showTomorrow = afterFlip && height >= TOMORROW_ROW;
  const fits = fitRows(height, ROW, GAP, showTomorrow ? TOMORROW_ROW + GAP : 0);
  const tomorrow = showTomorrow ? lane.tomorrow : undefined;
  const rows: Array<{ key: string; node: ReactNode }> = [];
  for (const c of lane.next) rows.push({ key: c.visit.id, node: <NextRow card={c} /> });
  if (lane.done.length > 0) rows.push({ key: 'done', node: <DoneRow cards={lane.done} /> });
  const { shown, hidden } = clipRows(rows.length, fits, CONFIG.MAX_NEXT_ROWS + 1);
  return (
    <div className="lane" data-testid={`lane-${lane.crew.leadLastName}`}>
      <div className="lane__head">
        <span className="lane__lead tier-c bold">{lane.crew.leadLastName}</span>
        <span className="lane__count tier-d muted">
          {lane.cards.length} · ✓{lane.completed}
        </span>
      </div>
      {lane.now && <NowCard card={lane.now} meta={snapshot.cardMeta[lane.now.visit.id]} />}
      <div className="lane__rows" ref={rowsRef}>
        {rows.slice(0, shown).map((r) => (
          <div key={r.key} className="lane__row">
            {r.node}
          </div>
        ))}
        {hidden > 0 && <div className="lane__row tier-d muted">+{hidden} more</div>}
        {showTomorrow && (
          <div className="lane__row lane__row--tomorrow" data-testid={`tomorrow-${lane.crew.leadLastName}`}>
            <span className="tier-d caps muted bold lane__tomorrow-label">TOMORROW</span>
            {tomorrow ? (
              <FitText text={`${localHHMM(tomorrow.visit.startAt)} ${tomorrow.job.lastName} · ${tomorrow.job.scope}`} max={38} min={24} className="bold lane__tomorrow-text" />
            ) : (
              <span className="tier-d muted lane__tomorrow-text">— nothing scheduled</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NowCard({ card, meta }: { card: LaneCard; meta: { photosCount?: number; synced: 'jobber' | 'queued' | 'none' } | undefined }) {
  const { visit, job, state, ackOverdue } = card;
  const line2: string[] = [`photos ${meta?.photosCount ?? '—'}`];
  if (job.companyCamUrl) line2.push('⧉');
  if (meta?.synced === 'queued') line2.push('queued');
  else if (meta?.synced === 'jobber') line2.push('J✓');
  if (visit.ack) line2.push(`ACK ${localHHMM(visit.ack.at)} ${visit.ack.initials}`);
  return (
    <div
      className={`now-card ${ackOverdue ? 'now-card--ack' : ''} ${state.grey ? 'now-card--grey' : ''}`}
      data-testid={`card-${visit.id}`}
      data-state={state.kind}
      data-grey={state.grey ? 'true' : 'false'}
      data-ack-overdue={ackOverdue ? 'true' : 'false'}
    >
      <FitText text={job.lastName} max={85} min={42} className="now-card__name tier-b" />
      <div className="now-card__where">
        <FitText text={`${job.city} · ${job.scope}`} max={42} min={24} className="bold" />
      </div>
      <div className="now-card__chip">
        <Chip state={state} fit />
      </div>
      {ackOverdue && <AckButton visitId={visit.id} />}
      <div className="now-card__meta tier-d muted">
        <span className="now-card__meta-line nowrap" data-testid={`meta-time-${visit.id}`}>
          {timeRange(visit.startAt, visit.endAt)}
        </span>
        <span className="now-card__meta-line ellipsis" title={line2.join(' · ')}>
          {line2.join(' · ')}
        </span>
      </div>
    </div>
  );
}

/** Decision 41: the ACK asks for a PIN when nobody is signed in, then POSTs /api/ack; the outcome shows beside the button. */
function AckButton({ visitId }: { visitId: string }) {
  const { requestAck, ackNotes } = useBoard();
  const note = ackNotes[visitId];
  return (
    <div className="ack">
      <button type="button" className="ack__btn" data-testid={`ack-${visitId}`} aria-label="acknowledge this Problem" onClick={() => requestAck(visitId)}>
        ACK
      </button>
      {note && (
        <span className={`tier-d ${note === 'queued' ? 'note--auto' : 'note--act'} ack__note ellipsis`} data-testid={`ack-note-${visitId}`} title={note}>
          {note}
        </span>
      )}
    </div>
  );
}

function NextRow({ card }: { card: LaneCard }) {
  return (
    <div className="next-row" data-testid={`card-${card.visit.id}`} data-state={card.state.kind} data-grey={card.state.grey ? 'true' : 'false'} data-ack-overdue="false">
      <FitText text={`${localHHMM(card.visit.startAt)} ${card.job.lastName} · ${card.job.scope}`} max={42} min={24} />
    </div>
  );
}

const PLAIN_FINISH = new Set(['DONE', 'READY', 'AWAITING REVIEW']);

function DoneRow({ cards }: { cards: LaneCard[] }) {
  return (
    <div className="done-row">
      {cards.map((c) => {
        const plain = PLAIN_FINISH.has(c.state.kind) || (c.state.kind === 'RESULT' && c.visit.result === 'Completed');
        const text = plain ? `✓ ${c.job.lastName}` : `${c.state.chipIcon} ${c.job.lastName} · ${c.state.chipWord}`;
        return (
          <span
            key={c.visit.id}
            className={`done-row__item tier-d ${c.state.grey ? 'muted' : ''}`}
            data-testid={`card-${c.visit.id}`}
            data-state={c.state.kind}
            data-grey={c.state.grey ? 'true' : 'false'}
            data-ack-overdue={c.ackOverdue ? 'true' : 'false'}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
