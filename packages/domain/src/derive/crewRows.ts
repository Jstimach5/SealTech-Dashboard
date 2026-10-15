/**
 * Crew rows (revision G): one row per crew, never collapsed, schedule only. Line 1 carries the crew name
 * and one next token (next visit, last day of a prep pair, an earlier finished visit, or after 15:00
 * tomorrow's first visit); line 2 the NOW job and its status. Nothing a crew owes appears here (decision
 * 16): owed items are ledger rows with the item word. Pure; `now` is passed in.
 */
import type { Crew, Instant, Snapshot } from '../types.js';
import { deriveLanes, type Lane, type LaneCard } from './lanes.js';
import { displayName, fmtTime, measureText, type Measure } from './display.js';
import type { IconName, TextTone } from './needsYou.js';

/** Crew row width and the gap kept between the crew name and the token, in px. */
export const CREW_ROW_PX = 544;
export const CREW_GAP_PX = 40;
/** The token's budget beside a given crew name (42/500), never under 352 px. */
export function crewTokenBudget(name: string, measure: Measure = measureText): number {
  return Math.max(352, CREW_ROW_PX - CREW_GAP_PX - measure(name, 42, 500));
}

export interface CrewRow {
  crew: Crew;
  name: string;
  token: string;
  tokenTone: TextTone;
  /** The NOW job, or `No visit today`. */
  job: string;
  jobMuted: boolean;
  icon?: IconName;
  status: string;
  /** Full status for aria-label and the laptop (`Return needed`, `Customer cancelled`). */
  statusFull: string;
}

const PR_RE = /\bPR:\s*day\s+(\d+)\s+of\s+(\d+)/i;

function prToken(card: LaneCard): string | undefined {
  const m = PR_RE.exec(card.visit.instructions ?? '');
  if (!m) return undefined;
  const n = Number(m[1]);
  const of = Number(m[2]);
  return n >= of ? `last day · ${n} of ${of}` : `day ${n} of ${of}`;
}

/** The status cell for a crew's NOW card. Office states (review, FIX, HOLD, READY) read as the crew's own result. */
export function crewStatus(card: LaneCard): { icon: IconName; status: string; statusFull: string } {
  const st = card.state;
  switch (st.kind) {
    case 'NOT STARTED': {
      const t = fmtTime(card.visit.startAt, true);
      return { icon: 'clock', status: t, statusFull: `starts ${t}` };
    }
    case 'NOW':
      return { icon: 'now', status: 'Now', statusFull: 'Now' };
    case 'STILL OPEN':
      return { icon: 'still', status: 'Still open', statusFull: 'Still open' };
    case 'NO RESULT':
      return { icon: 'noanswer', status: 'No result', statusFull: 'No result' };
    case 'RESULT':
      break;
    default:
      return { icon: 'done', status: 'Completed', statusFull: 'Completed' };
  }
  switch (card.visit.result) {
    case 'Completed':
      return { icon: 'done', status: 'Completed', statusFull: 'Completed' };
    case 'Return needed':
      return { icon: 'return', status: 'Return', statusFull: 'Return needed' };
    case 'Prepped':
      return { icon: 'prepped', status: 'Prepped', statusFull: 'Prepped' };
    case 'Not started':
      return { icon: 'notstarted', status: 'Not started', statusFull: 'Not started' };
    case 'Customer cancelled':
      return { icon: 'cancelled', status: 'Cancelled', statusFull: 'Customer cancelled' };
    case 'Problem':
      return { icon: 'problem', status: 'Problem', statusFull: 'Problem' };
    default:
      return { icon: 'done', status: 'Completed', statusFull: 'Completed' };
  }
}

/** Fit `<words> <time>`: drop the time first when the token passes the budget. */
function fitToken(words: string, time: string, budget: number, measure: Measure): string {
  const full = `${words} ${time}`;
  if (measure(full, 42, 400) <= budget) return full;
  return words;
}

function tokenFor(lane: Lane | undefined, tomorrow: LaneCard | undefined, afterFlip: boolean, budget: number, measure: Measure): { token: string; tone: TextTone } {
  if (afterFlip) {
    if (!tomorrow) return { token: 'none tomorrow', tone: 'amber' };
    return { token: fitToken(`tomorrow ${displayName(tomorrow.job.lastName)}`, fmtTime(tomorrow.visit.startAt, true), budget, measure), tone: 'ink' };
  }
  if (!lane) return { token: '', tone: 'ink' };
  const next = lane.next[0];
  if (next) return { token: fitToken(`→ ${displayName(next.job.lastName)}`, fmtTime(next.visit.startAt, true), budget, measure), tone: 'ink' };
  const pr = lane.now ? prToken(lane.now) : undefined;
  if (pr) return { token: pr, tone: 'ink' };
  const done = lane.done.filter((c) => c.visit.isComplete).at(-1);
  if (done) return { token: `${displayName(done.job.lastName)} done`, tone: 'ink' };
  return { token: 'last visit', tone: 'ink' };
}

/** Every crew in roster order, each with its row (a crew with no visit today still gets one). */
export function crewRows(s: Snapshot, now: Instant, measure: Measure = measureText): CrewRow[] {
  const lanes = deriveLanes(s, now);
  const rows = s.crews.map((crew) => {
    const lane = lanes.all.find((l) => l.crew.leadUserId === crew.leadUserId);
    const tomorrow = lanes.tomorrowByCrew?.[crew.leadUserId];
    const name = displayName(crew.leadLastName);
    const { token, tone } = tokenFor(lane, tomorrow, lanes.afterFlip, crewTokenBudget(name, measure), measure);
    if (!lane?.now) return { crew, name, token, tokenTone: tone, job: 'No visit today', jobMuted: true, status: '', statusFull: '' };
    const st = crewStatus(lane.now);
    return { crew, name, token, tokenTone: tone, job: displayName(lane.now.job.lastName), jobMuted: false, ...st };
  });
  // After the flip one crew's time may not fit beside its name: then no crew prints a time, so the column reads alike.
  if (lanes.afterFlip && rows.some((r) => r.token.startsWith('tomorrow ') && !/\d/.test(r.token))) {
    for (const r of rows) if (r.token.startsWith('tomorrow ')) r.token = r.token.replace(/ \d.*$/, '');
  }
  return rows;
}

