/**
 * The TODAY wall's sentences and counted lines (revision G): the answer line, the two win lines, the
 * Requires-invoicing table, the meta line and the hero reconciliation. Each is a pure function of the
 * snapshot and `now`, fitted to the wall's pixel budgets with the Inter width table.
 */
import { CONFIG } from '../config.js';
import type { Instant, Snapshot } from '../types.js';
import { localDate, localHHMM, minutesBetween } from './time.js';
import { boardStale, sourceFreshness } from './staleness.js';
import { actorInitials, type LedgerRow, type TextTone } from './needsYou.js';
import { displayName, fitJoin, fmtLocalHHMM, fmtTime, measureText, plural, weekdayDayMonth, weekdayOf, type Measure } from './display.js';

/** The answer sentence's budget in px at 76/700 display before FitText shrinks it (floor 64). */
export const ANSWER_PX = 1600;

export interface Headline {
  text: string;
  /** Rows that need someone now (critical + act today) and today, hidden rows included. */
  now: number;
  today: number;
  stale: boolean;
}

/** Decision 41 + revision G answer rule. */
export function headline(rows: LedgerRow[], s: Snapshot, now: Instant): Headline {
  const stale = boardStale(s.sources, now);
  const critical = rows.filter((r) => r.band === 'critical');
  const nNow = rows.filter((r) => r.band !== 'today').length;
  const nToday = rows.filter((r) => r.band === 'today').length;
  const base = { now: nNow, today: nToday, stale: stale.stale };
  if (critical.length === 1) {
    const r = critical[0] as LedgerRow;
    const tail = stale.stale && stale.lastOkAt ? `no ACK as of ${fmtTime(stale.lastOkAt)}` : `no ACK since ${r.age}`;
    return { ...base, text: `${r.who} Problem · ${tail}` };
  }
  if (critical.length > 1) return { ...base, text: `${critical.length} Problems · no ACK · first ${critical[0]?.age ?? ''}` };
  if (nNow > 0) return { ...base, text: nToday > 0 ? `${nNow} to act on now · ${nToday} more today` : `${nNow} to act on now` };
  if (nToday > 0) return { ...base, text: `Nothing to act on · ${nToday} more today` };
  if (s.hero.cannotInvoice > 0) return { ...base, text: `Nothing to act on · ${plural(s.hero.cannotInvoice, 'job')} to invoice` };
  const visitsToday = s.visits.filter((v) => localDate(v.startAt) === s.boardDate).length;
  return { ...base, text: `Nothing open · ${plural(visitsToday, 'visit')} today` };
}

/** Z2 head right: `Tue 5 of 7 visits kept · 2 unanswered` (the last worked day). Empty when nothing was planned. */
export function keptLine(s: Snapshot): string {
  const { kept, planned, unknown, day } = s.scoreline;
  if (planned === 0 && unknown === 0) return '';
  const wd = day ? weekdayOf(day) : 'Yesterday';
  return `${wd} ${kept} of ${planned} visits kept${unknown > 0 ? ` · ${unknown} unanswered` : ''}`;
}

/** Z1 line 2 right: the one wall win number (decisions 35, 44). */
export function firstPassLine(s: Snapshot): string {
  const fp = s.scoreline.firstPassReady;
  if (!fp) return 'READY 1st pass —';
  const text = `READY 1st pass ${fp.ready} of ${plural(fp.total, 'job')}`;
  return s.scoreline.firstPassWeek === 'last' ? `last week ${text}` : text;
}

/** Z1 line 2 right while stale: `Stale · Jobber as of 8:45 am`. */
export function staleLine(s: Snapshot, now: Instant): string | undefined {
  const st = boardStale(s.sources, now);
  if (!st.stale) return undefined;
  const name = st.source === 'reviewSheet' ? 'Review sheet' : 'Jobber';
  return st.lastOkAt ? `Stale · ${name} as of ${fmtTime(st.lastOkAt)}` : `Stale · ${name} not loaded`;
}

export interface MoneyLine {
  key: 'done_not_ready' | 'first_pass' | 'second_pass' | 'ready' | 'owner' | 'crews' | 'invoiced' | 'waiting';
  label: string;
  count: number;
  tone: TextTone;
}

/** Money table geometry: first line box top, pitch, and the Z3/Z4 split by crew count (revision G §2). */
export const MONEY_TOP = 382;
export const MONEY_PITCH = 48;
export function moneySlots(crewCount: number): number {
  const z4top = 974 - Math.max(2, crewCount) * 104;
  return Math.max(0, Math.floor((z4top - 24 - MONEY_TOP + 6) / MONEY_PITCH));
}

/** The Requires-invoicing table in its fixed order; the wall shows the first `moneySlots` lines. */
export function moneyLines(s: Snapshot, now: Instant): MoneyLine[] {
  const by = (pred: (r: string) => boolean) => s.cannotInvoice.filter((l) => pred(l.reason)).length;
  const p1 = actorInitials(1, s.people) ?? 'Office';
  const p2 = actorInitials(2, s.people) ?? 'Office';
  const past = (hhmm: string) => localDate(now) > s.boardDate || (localDate(now) === s.boardDate && localHHMM(now) >= hhmm);
  const p1Past = past(CONFIG.VERDICT_CUTOFF_PASS1);
  const p2Past = past(CONFIG.VERDICT_CUTOFF_PASS2);
  const invoicedInBucket = s.jobs.filter((j) => j.bucket === 'requires_invoicing' && j.invoiced).length;
  return [
    { key: 'done_not_ready', label: 'done today, not READY', count: s.hero.visitsNotReady, tone: 'ink' },
    {
      key: 'first_pass',
      label: p1Past ? `1st pass · past ${fmtLocalHHMM(s.boardDate, CONFIG.VERDICT_CUTOFF_PASS1).replace(/ [ap]m$/, '')}` : `1st pass · ${p1} ${fmtLocalHHMM(s.boardDate, CONFIG.VERDICT_CUTOFF_PASS1)}`,
      count: by((r) => r === 'AWAITING 1ST REVIEW'),
      tone: p1Past ? 'amber' : 'ink',
    },
    {
      key: 'second_pass',
      label: p2Past ? `2nd pass · past ${fmtLocalHHMM(s.boardDate, CONFIG.VERDICT_CUTOFF_PASS2, true).replace(/ [ap]m$/, '')}` : `2nd pass · ${p2} ${fmtLocalHHMM(s.boardDate, CONFIG.VERDICT_CUTOFF_PASS2, true)}`,
      count: by((r) => r === 'AWAITING 2ND REVIEW'),
      tone: p2Past ? 'amber' : 'ink',
    },
    { key: 'ready', label: 'ready to invoice', count: by((r) => r === 'READY TO INVOICE'), tone: 'ink' },
    { key: 'owner', label: 'owner decides', count: by((r) => r === 'HOLD'), tone: 'ink' },
    { key: 'crews', label: 'with crews', count: by((r) => ['FIX OPEN', 'RETURN NEEDED', 'BLOWER DOOR FAIL', 'FORM/QUANTITIES MISSING'].includes(r)), tone: 'ink' },
    { key: 'invoiced', label: 'invoiced, not closed', count: invoicedInBucket, tone: 'ink' },
    { key: 'waiting', label: 'waiting on others', count: by((r) => r === 'INSPECTION/PERMIT' || r === 'PROGRAM-WAIT'), tone: 'ink' },
  ];
}

/** Meta line (Z5): priority items, dropped from the end until the line fits 1728 px at 30/500. */
export const META_PX = 1728;
export function metaLine(s: Snapshot, now: Instant, measure: Measure = measureText): string {
  const items: string[] = [weekdayDayMonth(now)];
  if (s.mode === 'fixtures') items.push('Demo data');
  const src = (['jobber', 'reviewSheet', 'flagsSheet'] as const).filter((k) => s.sources[k]?.connected && s.sources[k]?.lastOkAt);
  const at = (k: (typeof src)[number]) => fmtTime(s.sources[k].lastOkAt as string);
  if (src.length > 0) {
    const times = new Set(src.map(at));
    if (times.size === 1) items.push(`Sources ${[...times][0]}`);
    else {
      if (src.includes('jobber')) items.push(`Jobber ${at('jobber')}`);
      const sheets = src.filter((k) => k !== 'jobber');
      const sheetTimes = new Set(sheets.map(at));
      if (sheetTimes.size === 1 && sheets.length > 0) items.push(`Sheets ${[...sheetTimes][0]}`);
      else for (const k of sheets) items.push(`${k === 'reviewSheet' ? 'Review sheet' : 'Flags'} ${at(k)}`);
    }
  }
  if (s.responderInitials) items.push(`Responder ${s.responderInitials}`);
  if (!s.sources.companyCam?.connected || sourceFreshness(s.sources.companyCam, now) === 'off') items.push('No photo feed');
  if (s.unmatchedReviewRows > 0) items.push(`${plural(s.unmatchedReviewRows, 'unmatched row')}`);
  if (s.counts.unanswered > 0) items.push(`${plural(s.counts.unanswered, 'form')} unanswered`);
  if (s.unansweredUnknown > 0) items.push(`${plural(s.unansweredUnknown, 'visit')} unknown`);
  const queued = s.queuedWrites.filter((w) => w.status === 'queued').length;
  if (queued > 0) items.push(`${plural(queued, 'write')} queued`);
  return fitJoin(items, META_PX, 30, 500, measure).text;
}

/** Cannot invoice's reconciliation sentence: why Jobber's count and the list differ. */
export function heroReconcile(s: Snapshot): string {
  const listed = s.cannotInvoice.filter((l) => s.jobs.find((j) => j.id === l.jobId)?.bucket === 'requires_invoicing').length;
  const parts = [`Jobber counts ${s.hero.cannotInvoice}`, `${listed} of them listed here`];
  for (const j of s.jobs) if (j.bucket === 'requires_invoicing' && j.invoiced) parts.push(`${displayName(j.lastName)} invoiced, not closed`);
  for (const l of s.cannotInvoice) {
    const j = s.jobs.find((x) => x.id === l.jobId);
    if (j && j.bucket !== 'requires_invoicing') parts.push(`${displayName(j.lastName)} listed, not in Jobber's count`);
  }
  return parts.join(' · ');
}

/** Minutes the un-ACKed Problem has waited (for tests and the laptop card). */
export function minutesWaiting(at: Instant, now: Instant): number {
  return Math.floor(minutesBetween(at, now));
}
