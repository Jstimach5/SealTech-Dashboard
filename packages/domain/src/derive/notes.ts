/**
 * House-format visit-note parser (decisions 11, 41, 42). The Jobber visit note is the record:
 * the office closer writes `CLOSE: <code>` at the 4 PM close, the crew lead's recap lands as
 * `VISIT RESULT: <value>` (decision 11), a multi-day job carries `PR: day n of m`, and the
 * responder's acknowledgement is `ACK 9:14 JJ` (decision 41). Miss reasons come from the fixed
 * list in decision 42. Lines are matched case-insensitively, tolerate extra spaces and a trailing
 * period, and anything else is ignored: garbage never throws. For each kind the newest note wins.
 * The `format*` helpers write the canonical strings the parser reads back. Pure functions.
 */
import { CLOSE_CODES, MISS_REASONS, VISIT_RESULTS, type CloseCode, type MissReason, type VisitResult } from '../enums.js';
import type { Instant, NoteLine } from '../types.js';
import { maxInstant } from './time.js';

export interface ParsedNotes {
  closeCode?: CloseCode;
  closeAt?: Instant;
  closeMissReason?: MissReason;
  visitResult?: VisitResult;
  visitResultAt?: Instant;
  visitMissReason?: MissReason;
  prDay?: { n: number; m: number; at: Instant };
  ack?: { at: Instant; initials: string; hhmm: string };
}

/** One recognised line of a note body, before it is stamped with the note's `at`. */
export type ParsedLine =
  | { kind: 'close'; code: CloseCode; missReason?: MissReason }
  | { kind: 'visit'; result: VisitResult; missReason?: MissReason }
  | { kind: 'prDay'; n: number; m: number }
  | { kind: 'ack'; hhmm: string; initials: string };

/** The newest line of each kind, stamped with the `at` of the note it came from. */
interface Slots {
  close?: { at: Instant; code: CloseCode; missReason?: MissReason };
  visit?: { at: Instant; result: VisitResult; missReason?: MissReason };
  prDay?: { at: Instant; n: number; m: number };
  ack?: { at: Instant; hhmm: string; initials: string };
}

// ---------------------------------------------------------------------------------------------
// Vocabulary matching

/** Comparison key: uppercase, spaces and hyphens interchangeable ('pre existing' = 'PRE-EXISTING'), no spaces around '/'. */
export function vocabKey(s: string): string {
  return s
    .toUpperCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/[\s-]+/g, ' ')
    .trim();
}

function findVocab<T extends string>(values: readonly T[], raw: string): T | undefined {
  const k = vocabKey(raw);
  return values.find((v) => vocabKey(v) === k);
}

/** Decision 42: the fixed miss-reason list, case-insensitive and hyphen/space tolerant. */
export function parseMissReason(raw: string): MissReason | undefined {
  return findVocab(MISS_REASONS, raw);
}

/** Decision 10: Jobber's six Visit result values, case-insensitive. */
export function parseVisitResult(raw: string): VisitResult | undefined {
  return findVocab(VISIT_RESULTS, raw);
}

/** The office close codes, case-insensitive ('nw r' = 'NW-R'). */
export function parseCloseCode(raw: string): CloseCode | undefined {
  return findVocab(CLOSE_CODES, raw);
}

// ---------------------------------------------------------------------------------------------
// Line grammar

/** Trim, collapse runs of whitespace, drop an optional trailing period. */
function normalizeLine(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/\.+$/, '').trim();
}

/** ` — note`, ` – note` or ` - note` ends the parsed part of a line; the note itself is ignored. */
function stripFreeText(s: string): string {
  const i = s.search(/ [—–-] /);
  return i === -1 ? s : s.slice(0, i);
}

/** `<head> / <reason>`: split on the first slash only, so 'EQUIPMENT/TRUCK' stays whole in the reason. */
function splitReason(s: string): { head: string; reason?: string } {
  const i = s.indexOf('/');
  if (i === -1) return { head: s.trim() };
  return { head: s.slice(0, i).trim(), reason: s.slice(i + 1).trim() };
}

function withReason<T extends object>(base: T, missReason: MissReason | undefined): T & { missReason?: MissReason } {
  return missReason === undefined ? base : { ...base, missReason };
}

/** Decision 11: `CLOSE: <code>` optionally ` / <MissReason>`. An unknown code drops the line; an unknown reason drops only the reason. */
export function parseCloseLine(line: string): ParsedLine | undefined {
  const m = /^CLOSE\s*:\s*(.*)$/i.exec(line);
  if (!m) return undefined;
  const { head, reason } = splitReason(m[1] ?? '');
  const code = parseCloseCode(head);
  if (code === undefined) return undefined;
  return withReason({ kind: 'close' as const, code }, reason === undefined ? undefined : parseMissReason(reason));
}

/** Decisions 10, 11, 42: `VISIT RESULT: <value>` optionally ` / <MissReason>`, optionally ` — <free text>` (ignored). */
export function parseVisitResultLine(line: string): ParsedLine | undefined {
  const m = /^VISIT RESULT\s*:\s*(.*)$/i.exec(line);
  if (!m) return undefined;
  const { head, reason } = splitReason(stripFreeText(m[1] ?? ''));
  const result = parseVisitResult(head);
  if (result === undefined) return undefined;
  return withReason({ kind: 'visit' as const, result }, reason === undefined ? undefined : parseMissReason(reason));
}

/** Decision 11: `PR: day n of m`, positive integers. */
export function parsePrDayLine(line: string): ParsedLine | undefined {
  const m = /^PR\s*:\s*DAY (\d+) OF (\d+)$/i.exec(line);
  if (!m) return undefined;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (n < 1 || d < 1) return undefined;
  return { kind: 'prDay', n, m: d };
}

/** Decision 41: `ACK H:MM II` / `ACK HH:MM II`, initials 2–3 letters. HH:MM is kept as written for display. */
export function parseAckLine(line: string): ParsedLine | undefined {
  const m = /^ACK (\d{1,2}):(\d{2}) ([A-Z]{2,3})$/i.exec(line);
  if (!m) return undefined;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return undefined;
  return { kind: 'ack', hhmm: `${m[1]}:${m[2]}`, initials: (m[3] ?? '').toUpperCase() };
}

/** One trimmed line → the first grammar that accepts it, or undefined for anything else. */
export function parseLine(raw: string): ParsedLine | undefined {
  const line = normalizeLine(raw);
  return parseCloseLine(line) ?? parseVisitResultLine(line) ?? parsePrDayLine(line) ?? parseAckLine(line);
}

// ---------------------------------------------------------------------------------------------
// Newest wins

/** Newest line of a kind wins; on an equal `at` the later line (later in the array, or lower in the body) wins. */
function isNewest(candidate: Instant, incumbent: Instant | undefined): boolean {
  if (incumbent === undefined) return true;
  return maxInstant(candidate, incumbent) === candidate;
}

function place(slots: Slots, line: ParsedLine, at: Instant): void {
  if (!isNewest(at, slots[line.kind]?.at)) return;
  switch (line.kind) {
    case 'close':
      slots.close = withReason({ at, code: line.code }, line.missReason);
      break;
    case 'visit':
      slots.visit = withReason({ at, result: line.result }, line.missReason);
      break;
    case 'prDay':
      slots.prDay = { at, n: line.n, m: line.m };
      break;
    case 'ack':
      slots.ack = { at, hhmm: line.hhmm, initials: line.initials };
      break;
  }
}

/** Every recognised line of one note body, in order, so a repeated kind inside one body resolves to its last line. */
function placeBody(slots: Slots, text: string, at: Instant): void {
  for (const raw of text.split(/\r?\n/)) {
    const line = parseLine(raw);
    if (line !== undefined) place(slots, line, at);
  }
}

function toParsedNotes(slots: Slots): ParsedNotes {
  const out: ParsedNotes = {};
  if (slots.close !== undefined) {
    out.closeCode = slots.close.code;
    out.closeAt = slots.close.at;
    if (slots.close.missReason !== undefined) out.closeMissReason = slots.close.missReason;
  }
  if (slots.visit !== undefined) {
    out.visitResult = slots.visit.result;
    out.visitResultAt = slots.visit.at;
    if (slots.visit.missReason !== undefined) out.visitMissReason = slots.visit.missReason;
  }
  if (slots.prDay !== undefined) out.prDay = { n: slots.prDay.n, m: slots.prDay.m, at: slots.prDay.at };
  if (slots.ack !== undefined) out.ack = { at: slots.ack.at, initials: slots.ack.initials, hhmm: slots.ack.hhmm };
  return out;
}

/** A note the parser can use: string text and a real instant (an unparseable `at` can never be "newest"). */
function isUsableNote(note: NoteLine): boolean {
  return typeof note?.text === 'string' && typeof note.at === 'string' && !Number.isNaN(new Date(note.at).getTime());
}

// ---------------------------------------------------------------------------------------------
// Public API

/** Decisions 11, 41, 42: one note body (may hold several lines) → the parsed fields, stamped with `at`. */
export function parseNoteText(text: string, at: Instant): Partial<ParsedNotes> {
  const slots: Slots = {};
  placeBody(slots, typeof text === 'string' ? text : '', at);
  return toParsedNotes(slots);
}

/** Decisions 11, 41, 42: all of a job's or visit's notes → the newest line of each kind. */
export function parseNotes(lines: NoteLine[]): ParsedNotes {
  const slots: Slots = {};
  for (const note of lines) {
    if (!isUsableNote(note)) continue;
    placeBody(slots, note.text, note.at);
  }
  return toParsedNotes(slots);
}

/** Decision 11: `CLOSE: PR / ACCESS`. */
export function formatCloseLine(code: CloseCode, missReason?: MissReason): string {
  return missReason === undefined ? `CLOSE: ${code}` : `CLOSE: ${code} / ${missReason}`;
}

/** Decisions 11, 42: `VISIT RESULT: Problem / ACCESS — note`. The note is flattened to one line. */
export function formatVisitResultLine(result: VisitResult, missReason?: MissReason, note?: string): string {
  let line = `VISIT RESULT: ${result}`;
  if (missReason !== undefined) line += ` / ${missReason}`;
  const text = (note ?? '').replace(/\s+/g, ' ').trim();
  if (text !== '') line += ` — ${text}`;
  return line;
}

/** Decision 41: `ACK 9:14 JJ`. */
export function formatAckLine(hhmm: string, initials: string): string {
  return `ACK ${hhmm.trim()} ${initials.trim().toUpperCase()}`;
}
