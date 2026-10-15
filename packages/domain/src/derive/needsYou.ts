/**
 * The Needs-you ledger (revision G, proposed decision 50): every open item that someone must act on now
 * or today gets exactly one ranked row with who, how old, whose move, what and why, and the next step.
 * Everything else is counted in the Requires-invoicing table or sits on Cannot invoice / Stages.
 *
 * Bands (never printed as words on the wall):
 *   critical  — a Problem with no ACK (decision 41), oldest first; red only from 15 minutes.
 *   act today — in class order: still-open visit, Jobber Late, hard red, red money, overdue FIX, Action required.
 *   today     — in class order: ready to invoice, a return or re-test to book, a form the crew still owes.
 * Inside a class, oldest first, then job number. One row per job: the first band and class that claims it.
 * Pure; `now` is passed in. Words come from templates only: no sheet free text, no note text (decision 54).
 */
import { CONFIG } from '../config.js';
import { BUCKET_LABEL } from '../enums.js';
import type { AttentionLine, CannotInvoiceLine, Instant, Job, JobberId, ReviewRow, Snapshot, Visit } from '../types.js';
import { addLocalDays, fromLocal, localDate, localParts, minutesBetween, toDate } from './time.js';
import { crewLeadInitialsFor, ownerText } from './owner.js';
import { isHumanRow } from './cannotInvoice.js';
import { boardStale } from './staleness.js';
import { displayName, fmtLocalHHMM, fmtTime, measureText, sentenceCase, weekdayDayMonth, type Measure } from './display.js';

export type Band = 'critical' | 'act_today' | 'today';
export const BAND_ORDER: Record<Band, number> = { critical: 0, act_today: 1, today: 2 };
/** Laptop / phone band headings (the wall prints none). */
export const BAND_LABEL: Record<Band, string> = { critical: 'Act now', act_today: 'Act now', today: 'Today' };

/** Icon names of the wall's SVG set (apps/board/src/ui/Icon.tsx); ⚠ is Problem / Late / Still open only. */
export type IconName =
  | 'problem'
  | 'late'
  | 'still'
  | 'review'
  | 'hold'
  | 'fix'
  | 'ready'
  | 'action'
  | 'form'
  | 'noanswer'
  | 'return'
  | 'retest'
  | 'inspection'
  | 'now'
  | 'clock'
  | 'done'
  | 'prepped'
  | 'notstarted'
  | 'cancelled';

export type TextTone = 'ink' | 'amber' | 'red';

export interface LedgerRow {
  key: string;
  band: Band;
  /** Class order inside the band (see the header). */
  klass: number;
  jobId: JobberId;
  jobNumber: number;
  visitId?: JobberId;
  who: string;
  /** Shown only when it fits beside the name (twins `#9020`, the leak's Jobber bucket). */
  secondary?: string;
  icon: IconName;
  status: string;
  statusTone: TextTone;
  why: string;
  age: string;
  ageTone: TextTone;
  owner: string;
  next: string;
  /** Un-ACKed Problem: the ACK button shows; `overdue` draws the decision-41 ring (withheld while stale). */
  ack?: { overdue: boolean };
  /** Older first inside a class: the instant the clock started. */
  since: number;
}

const DAY_MS = 86_400_000;
/** Line 2 left cell budget in px at 42 px (icon 0.78 em + 12 px gap + status + ` · ` + why). */
export const LINE2_LEFT_PX = 680;
const ICON_PX = 0.78 * 42 + 12;

function ageDays(n: number, approx = false): string {
  if (n <= 0) return 'today';
  return `${approx ? '~' : ''}${n} d`;
}

function elapsed(fromAt: Instant, now: Instant): string {
  const m = Math.max(0, Math.floor(minutesBetween(fromAt, now)));
  if (m < 100) return `${m} min`;
  return `${Math.floor(m / 60)} h`;
}

function toneOf(line: CannotInvoiceLine): TextTone {
  if (line.colour === 'red') return 'red';
  if (line.colour === 'amber') return 'amber';
  return 'ink';
}

/** The first person who reviews on pass `p` (decision 5): Henry on 1, Jack on 2. */
export function actorInitials(pass: 1 | 2, people: Snapshot['people']): string | undefined {
  return people.find((p) => p.reviewPass === pass)?.initials;
}

function officeInitialsOf(people: Snapshot['people']): string {
  return (people.find((p) => p.role === 'office') ?? people.find((p) => p.role === 'owner'))?.initials ?? 'OFFICE';
}

/** Twins: two open jobs with the same last name print their job number. */
function twinSecondary(job: Job, jobs: Job[]): string | undefined {
  const same = jobs.filter((j) => j.lastName === job.lastName && j.bucket !== 'archived');
  return same.length > 1 ? `#${job.jobNumber}` : undefined;
}

/** End of the next business day after the FIX was written (decision 7), as an instant. */
export function fixDueAt(reviewedAt: Instant): Instant {
  let day = localDate(reviewedAt);
  do {
    day = addLocalDays(day, 1);
  } while ([0, 6].includes(localParts(fromLocal(day, '12:00')).weekday));
  return fromLocal(addLocalDays(day, 1), '00:00');
}

function latestHumanFix(jobId: JobberId, rows: ReviewRow[]): ReviewRow | undefined {
  const fixes = rows.filter((r) => r.matchedJobId === jobId && r.match !== 'none' && isHumanRow(r) && r.verdict === 'FIX' && r.reviewedAt);
  return fixes.sort((a, b) => toDate(a.reviewedAt as string).getTime() - toDate(b.reviewedAt as string).getTime()).at(-1);
}

function latestVisitOfJob(jobId: JobberId, visits: Visit[]): Visit | undefined {
  return visits.filter((v) => v.jobId === jobId).sort((a, b) => toDate(a.startAt).getTime() - toDate(b.startAt).getTime()).at(-1);
}

function reviewWhy(jobId: JobberId, rows: ReviewRow[]): string {
  const mine = rows.filter((r) => r.matchedJobId === jobId && r.match !== 'none');
  if (mine.length === 0) return 'no review row';
  if (!mine.some(isHumanRow)) return 'checked overnight';
  return 'back for review';
}

/** Fit `status · why` into the line-2 budget: drop the why first, ellipsize a long why before that. */
export function fitLine2(status: string, why: string, measure: Measure = measureText): string {
  const fits = (w: string) => ICON_PX + measure(status, 42, 600) + (w ? measure(` · ${w}`, 42, 400) : 0) <= LINE2_LEFT_PX;
  if (!why || fits(why)) return why;
  let cut = why;
  while (cut.length > 8) {
    cut = cut.slice(0, -1).trimEnd();
    if (fits(`${cut}…`)) return `${cut}…`;
  }
  return '';
}

interface Ctx {
  s: Snapshot;
  now: Instant;
  stale: ReturnType<typeof boardStale>;
  jobs: Map<JobberId, Job>;
  measure: Measure;
}

function rowBase(ctx: Ctx, job: Job, band: Band, klass: number, since: number): Pick<LedgerRow, 'key' | 'band' | 'klass' | 'jobId' | 'jobNumber' | 'who' | 'since'> & { secondary?: string } {
  const out: Pick<LedgerRow, 'key' | 'band' | 'klass' | 'jobId' | 'jobNumber' | 'who' | 'since'> & { secondary?: string } = {
    key: `${band}:${job.id}`,
    band,
    klass,
    jobId: job.id,
    jobNumber: job.jobNumber,
    who: displayName(job.lastName),
    since,
  };
  const twin = twinSecondary(job, ctx.s.jobs);
  if (twin) out.secondary = twin;
  return out;
}

/** A cannot-invoice line as a ledger row, in the given band and class. */
function moneyRow(ctx: Ctx, line: CannotInvoiceLine, band: Band, klass: number): LedgerRow | undefined {
  const job = ctx.jobs.get(line.jobId);
  if (!job) return undefined;
  const { s, now } = ctx;
  const since = toDate(now).getTime() - line.stageDays * DAY_MS;
  const base = rowBase(ctx, job, band, klass, since);
  if (line.tags.includes('NO-REMINDER') && job.bucket !== 'requires_invoicing') base.secondary = `Jobber: ${sentenceCase(BUCKET_LABEL[job.bucket])}`;
  const tone = toneOf(line);
  const ageTone: TextTone = tone;
  const statusTone: TextTone = tone === 'red' ? 'red' : 'ink';
  const owner = ownerText(line.owner);
  const p1 = actorInitials(1, s.people) ?? 'OFFICE';
  const p2 = actorInitials(2, s.people) ?? 'OFFICE';
  const common = { ...base, age: ageDays(line.stageDays), ageTone, statusTone, owner };
  switch (line.reason) {
    case 'AWAITING 1ST REVIEW':
      return { ...common, icon: 'review', status: '1st review', why: reviewWhy(job.id, s.reviewRows), next: `→ ${p1} ${fmtLocalHHMM(s.boardDate, CONFIG.VERDICT_CUTOFF_PASS1)}` };
    case 'AWAITING 2ND REVIEW':
      return { ...common, icon: 'review', status: '2nd review', why: '1st pass READY', next: `→ ${p2} ${fmtLocalHHMM(s.boardDate, CONFIG.VERDICT_CUTOFF_PASS2, true)}` };
    case 'HOLD':
      return { ...common, icon: 'hold', status: 'HOLD', why: 'owner decides', next: '→ huddle' };
    case 'FIX OPEN': {
      const fix = latestHumanFix(job.id, s.reviewRows);
      const due = fix?.reviewedAt ? fixDueAt(fix.reviewedAt) : undefined;
      const dueDay = due ? weekdayDayMonth(new Date(toDate(due).getTime() - 1).toISOString()).split(' ')[0] : undefined;
      const overdue = due ? toDate(now) >= toDate(due) : false;
      return { ...common, owner: 'CREW', icon: 'fix', status: 'FIX', why: fitLine2('FIX', line.fixPick ?? 'see Cannot invoice', ctx.measure), next: dueDay ? `→ ${overdue ? 'was due' : 'due'} ${dueDay}` : '→ fix it' };
    }
    case 'RETURN NEEDED': {
      const v = latestVisitOfJob(job.id, s.visits);
      return { ...common, icon: 'return', status: 'Return needed', why: v?.missReason ? sentenceCase(v.missReason) : 'none booked', next: '→ book return' };
    }
    case 'BLOWER DOOR FAIL':
      return { ...common, owner: 'CREW', icon: 'retest', status: 'Re-test', why: 'blower door', next: '→ book re-test' };
    case 'FORM/QUANTITIES MISSING':
      return { ...common, owner: 'CREW', icon: 'form', status: 'Form incomplete', why: 'job form', next: '→ in Jobber' };
    case 'INSPECTION/PERMIT':
      return { ...common, icon: 'inspection', status: 'Inspection', why: 'failed', next: '→ rebook it' };
    case 'READY TO INVOICE':
      return { ...common, icon: 'ready', status: 'READY', why: 'both passes', next: '→ invoice' };
    case 'PROGRAM-WAIT':
      return undefined;
  }
}

function attentionRow(ctx: Ctx, a: AttentionLine, klass: number): LedgerRow | undefined {
  const job = ctx.jobs.get(a.jobId);
  if (!job) return undefined;
  const base = rowBase(ctx, job, 'act_today', klass, toDate(a.sinceAt).getTime());
  const common = { ...base, age: ageDays(a.ageDays, a.sinceSource === 'updatedAt'), ageTone: 'ink' as TextTone, statusTone: 'ink' as TextTone, owner: ownerText(a.owner) };
  if (a.kind === 'late') {
    const open = ctx.s.visits
      .filter((v) => v.jobId === job.id && !v.isComplete && v.result === undefined && toDate(v.startAt) <= toDate(ctx.now))
      .sort((x, y) => toDate(x.startAt).getTime() - toDate(y.startAt).getTime())
      .at(-1);
    const why = open ? `${weekdayDayMonth(open.startAt)} visit open` : 'late in Jobber';
    return { ...common, ...(open ? { visitId: open.id } : {}), icon: 'late', status: 'Late', why, next: '→ done or not?' };
  }
  return { ...common, icon: 'action', status: 'Action required', why: job.futureVisitCount === 0 ? 'none booked' : 'in Jobber', next: '→ book it' };
}

/** Every open item that needs someone now or today, ranked. */
export function needsYou(s: Snapshot, now: Instant, measure: Measure = measureText): LedgerRow[] {
  const ctx: Ctx = { s, now, stale: boardStale(s.sources, now), jobs: new Map(s.jobs.map((j) => [j.id, j])), measure };
  const t = toDate(now).getTime();
  const placed = new Set<JobberId>();
  const rows: LedgerRow[] = [];
  const add = (r: LedgerRow | undefined) => {
    if (!r || placed.has(r.jobId)) return;
    const job = ctx.jobs.get(r.jobId);
    if (job?.invoiced) return;
    placed.add(r.jobId);
    rows.push(r);
  };
  const queuedAck = new Set(s.queuedWrites.filter((w) => w.kind === 'ack' && w.status !== 'sent').map((w) => w.targetId));
  const lines = s.cannotInvoice;
  const boardDate = s.boardDate;

  // critical: Problem, no ACK, no queued ACK (decision 41)
  for (const v of s.visits) {
    if (v.result !== 'Problem' || v.ack || queuedAck.has(v.id)) continue;
    const at = v.resultAt ?? v.completedAt ?? v.endAt;
    if (toDate(at).getTime() > t) continue;
    const job = ctx.jobs.get(v.jobId);
    if (!job) continue;
    const overdue = minutesBetween(at, now) >= CONFIG.ACK_MIN && !ctx.stale.stale;
    const why = ctx.stale.stale && ctx.stale.lastOkAt ? `no ACK as of ${fmtTime(ctx.stale.lastOkAt)}` : v.missReason ? sentenceCase(v.missReason) : '';
    add({
      ...rowBase(ctx, job, 'critical', 0, toDate(at).getTime()),
      visitId: v.id,
      icon: 'problem',
      status: 'Problem',
      statusTone: overdue ? 'red' : 'ink',
      why,
      age: fmtTime(at),
      ageTone: overdue ? 'red' : 'ink',
      owner: s.responderInitials ?? officeInitialsOf(s.people),
      next: '',
      ack: { overdue },
    });
  }

  // act today (1): one of today's visits past end + grace, still open, no result
  const lateJobs = new Set(s.attention.filter((a) => a.kind === 'late').map((a) => a.jobId));
  for (const v of s.visits) {
    if (localDate(v.startAt) !== boardDate || v.isComplete || v.result !== undefined) continue;
    if (minutesBetween(v.endAt, now) <= CONFIG.NO_RESULT_GRACE_MIN || lateJobs.has(v.jobId)) continue;
    const job = ctx.jobs.get(v.jobId);
    if (!job) continue;
    add({
      ...rowBase(ctx, job, 'act_today', 1, toDate(v.endAt).getTime()),
      visitId: v.id,
      icon: 'still',
      status: 'Still open',
      statusTone: 'ink',
      why: `ended ${fmtTime(v.endAt, true)}`,
      age: elapsed(v.endAt, now),
      ageTone: 'ink',
      owner: 'CREW',
      next: '→ answer it',
    });
  }
  // (2) Jobber Late
  for (const a of s.attention) if (a.kind === 'late') add(attentionRow(ctx, a, 2));
  // (3) hard red, (4) red money (inspection/program waits excluded by colour: they are grey)
  for (const l of lines) if (l.hardRed) add(moneyRow(ctx, l, 'act_today', 3));
  for (const l of lines) if (!l.hardRed && l.colour === 'red') add(moneyRow(ctx, l, 'act_today', 4));
  // (5) FIX past end of next business day (decision 7)
  for (const l of lines) {
    if (l.reason !== 'FIX OPEN') continue;
    const fix = latestHumanFix(l.jobId, s.reviewRows);
    if (fix?.reviewedAt && t >= toDate(fixDueAt(fix.reviewedAt)).getTime()) add(moneyRow(ctx, l, 'act_today', 5));
  }
  // (6) Jobber Action required
  for (const a of s.attention) if (a.kind === 'action_required') add(attentionRow(ctx, a, 6));

  // today (1) ready to invoice
  for (const l of lines) if (l.reason === 'READY TO INVOICE') add(moneyRow(ctx, l, 'today', 1));
  // (2) a return or re-test to book
  for (const l of lines) if (l.reason === 'RETURN NEEDED' || l.reason === 'BLOWER DOOR FAIL') add(moneyRow(ctx, l, 'today', 2));
  for (const v of s.visits) {
    if (v.result !== 'Problem' || (!v.ack && !queuedAck.has(v.id))) continue;
    const job = ctx.jobs.get(v.jobId);
    if (!job || job.futureVisitCount > 0) continue;
    const at = v.resultAt ?? v.endAt;
    const days = Math.max(0, Math.round((t - toDate(at).getTime()) / DAY_MS));
    add({
      ...rowBase(ctx, job, 'today', 2, toDate(at).getTime()),
      visitId: v.id,
      icon: 'problem',
      status: 'Problem',
      statusTone: 'ink',
      why: v.ack ? `ACK ${fmtTime(v.ack.at)}` : 'ACK queued',
      age: ageDays(localDate(now) === localDate(at) ? 0 : days),
      ageTone: 'ink',
      owner: crewLeadInitialsFor(v, s.crews, s.people as Parameters<typeof crewLeadInitialsFor>[2]) ?? 'CREW',
      next: '→ book return',
    });
  }
  // (3) a form the crew still owes
  for (const l of lines) if (l.reason === 'FORM/QUANTITIES MISSING') add(moneyRow(ctx, l, 'today', 3));
  const worked = s.scoreline.day ?? addLocalDays(boardDate, -1);
  for (const v of s.visits) {
    if (localDate(v.startAt) !== worked || v.result !== undefined) continue;
    if (v.formsSeenMax === 0 || v.incompleteJobFormsCount === 0) continue;
    const past = v.isComplete || minutesBetween(v.endAt, now) > CONFIG.NO_RESULT_GRACE_MIN;
    const job = ctx.jobs.get(v.jobId);
    if (!past || !job) continue;
    const days = Math.max(1, Math.round((t - toDate(v.endAt).getTime()) / DAY_MS));
    add({
      ...rowBase(ctx, job, 'today', 3, toDate(v.endAt).getTime()),
      visitId: v.id,
      icon: 'noanswer',
      status: 'No answer',
      statusTone: 'ink',
      why: `${weekdayDayMonth(v.startAt).split(' ')[0]} visit`,
      age: ageDays(days),
      ageTone: 'ink',
      owner: 'CREW',
      next: '→ in Jobber',
    });
  }

  for (const r of rows) r.why = fitLine2(r.status, r.why, measure);
  return rows.sort(compareLedgerRows);
}

export function compareLedgerRows(a: LedgerRow, b: LedgerRow): number {
  if (a.band !== b.band) return BAND_ORDER[a.band] - BAND_ORDER[b.band];
  if (a.klass !== b.klass) return a.klass - b.klass;
  if (a.since !== b.since) return a.since - b.since;
  return a.jobNumber - b.jobNumber;
}

/** Ledger slots on the wall (decision 50 layout): six, the sixth becoming the names line when more exist. */
export const LEDGER_SLOTS = 6;
/** Names line budget in px at 42/500. */
export const NAMES_LINE_PX = 1072;

/** `+5 · Holt · Kowalski · Diaz · Rossi · Greene`: every hidden row by name, as many as fit, then `…`. */
export function namesLine(hidden: LedgerRow[], measure: Measure = measureText): string {
  if (hidden.length === 0) return '';
  const head = `+${hidden.length}`;
  const all = [head, ...hidden.map((r) => r.who)].join(' · ');
  if (measure(all, 42, 500) <= NAMES_LINE_PX) return all;
  let text = head;
  for (const r of hidden) {
    const next = `${text} · ${r.who}`;
    if (measure(`${next} · …`, 42, 500) > NAMES_LINE_PX) return `${text} · …`;
    text = next;
  }
  return text;
}

/** Visible rows and the names line for the wall. */
export function ledgerSlots(rows: LedgerRow[], measure: Measure = measureText): { visible: LedgerRow[]; names: string; hidden: LedgerRow[] } {
  if (rows.length <= LEDGER_SLOTS) return { visible: rows, names: '', hidden: [] };
  const visible = rows.slice(0, LEDGER_SLOTS - 1);
  const hidden = rows.slice(LEDGER_SLOTS - 1);
  return { visible, names: namesLine(hidden, measure), hidden };
}
