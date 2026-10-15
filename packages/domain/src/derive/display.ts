/**
 * Wall wording helpers (revision G, decision 54): one 12-hour clock style everywhere, weekday dates,
 * display names, sentence-case reason words, and a deterministic text measure built from Inter's own
 * advance widths, so the domain can fit a line to a pixel budget the same way in tests and on the TV.
 * Pure functions; `now` is always passed in where time matters.
 */
import type { Reason } from '../enums.js';
import type { Instant, LocalDate } from '../types.js';
import { INTER_ADVANCE } from './interWidths.js';
import { fromLocal, localParts } from './time.js';

/** Weight key into the width table: 400 / 500 / 600 / 700 text cut, or `d700` for Inter Display Bold. */
export type MeasureWeight = 400 | 500 | 600 | 700 | 'd700';

/** Measure text in CSS px: (text, font px, weight, tabular digits?) → width. */
export type Measure = (text: string, px: number, weight: MeasureWeight, tabular?: boolean) => number;

/** Width of `text` at `px` in Inter, from the advance table. Unknown characters count as one em. */
export const measureText: Measure = (text, px, weight, tabular = false) => {
  const table = INTER_ADVANCE[String(weight)] ?? INTER_ADVANCE['400'] ?? {};
  const tnum = table['_tnum'] ?? 0.6;
  let em = 0;
  for (const ch of text) {
    if (tabular && ch >= '0' && ch <= '9') em += tnum;
    else em += table[ch] ?? 1;
  }
  return em * px;
};

/** `9:05 am`, `4:30 pm`, `12:05 pm`. `short` drops `:00` on the hour (`1 pm`), for tight cells only. */
export function fmtTime(instant: Instant, short = false): string {
  const p = localParts(instant);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const ampm = p.h < 12 ? 'am' : 'pm';
  if (short && p.min === 0) return `${h12} ${ampm}`;
  return `${h12}:${String(p.min).padStart(2, '0')} ${ampm}`;
}

/** A local HH:MM config value (`16:30`) on a given day, as the wall prints it (`4:30 pm`). */
export function fmtLocalHHMM(day: LocalDate, hhmm: string, short = false): string {
  return fmtTime(fromLocal(day, hhmm), short);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `Wed 14 Oct`. */
export function weekdayDayMonth(instant: Instant): string {
  const p = localParts(instant);
  return `${WEEKDAY[p.weekday]} ${p.d} ${MONTH[p.m - 1]}`;
}

/** `Wed` for a local date. */
export function weekdayOf(day: LocalDate): string {
  return WEEKDAY[localParts(fromLocal(day, '12:00')).weekday] ?? '';
}

/**
 * A stored last name as the wall prints it. Jobber's own casing passes through untouched; a name the
 * title parser upper-cased reads in title case, keeping the Mc and O' forms (`MCDONALD` → `McDonald`,
 * `O'BRIEN` → `O'Brien`, `SMITH-JONES` → `Smith-Jones`).
 */
export function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\bMc(\p{L})/gu, (_m, ch: string) => `Mc${ch.toUpperCase()}`);
}

/** Decision 30's ten reasons in sentence case, for why text and Cannot invoice group heads. */
export const REASON_LABEL: Record<Reason, string> = {
  'AWAITING 1ST REVIEW': 'Awaiting 1st review',
  'AWAITING 2ND REVIEW': 'Awaiting 2nd review',
  'FIX OPEN': 'FIX open',
  HOLD: 'HOLD',
  'RETURN NEEDED': 'Return needed',
  'BLOWER DOOR FAIL': 'Blower-door fail',
  'FORM/QUANTITIES MISSING': 'Form incomplete',
  'INSPECTION/PERMIT': 'Inspection or permit',
  'PROGRAM-WAIT': 'With CLEAResult',
  'READY TO INVOICE': 'Ready to invoice',
};

/** Sentence case for upper-case stored text (`ACCESS` → `Access`, `EQUIPMENT/TRUCK` → `Equipment/truck`). */
export function sentenceCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Decision 41's focus line arrives upper-case from older entries: print it in sentence case. */
export function focusText(focus: string): string {
  return focus ? sentenceCase(focus.trim()) : '';
}

/** `1 job` / `2 jobs`. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Join items with ` · ` until the next one would pass `maxPx`; the rest are dropped from the end.
 * Returns the line and how many items were kept.
 */
export function fitJoin(items: string[], maxPx: number, px: number, weight: MeasureWeight, measure: Measure = measureText): { text: string; kept: number } {
  let text = '';
  let kept = 0;
  for (const item of items) {
    const candidate = kept === 0 ? item : `${text} · ${item}`;
    if (measure(candidate, px, weight) > maxPx) break;
    text = candidate;
    kept++;
  }
  return { text, kept };
}
