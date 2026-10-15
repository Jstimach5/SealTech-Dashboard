/**
 * Local-time helpers. Jobber returns UTC instants; every "today", "midnight", "15:00" on the board
 * is America/Detroit. No library: Intl.DateTimeFormat gives the wall-clock parts, and the offset
 * is recovered from them. Pure functions; `now` is always passed in.
 */
import { CONFIG } from '../config.js';
import type { Instant, LocalDate } from '../types.js';

export const TZ: string = CONFIG.TZ;

export interface LocalParts {
  y: number;
  m: number; // 1-12
  d: number;
  h: number;
  min: number;
  s: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function toDate(instant: Instant | Date): Date {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid instant: ${String(instant)}`);
  return d;
}

export function localParts(instant: Instant | Date, tz: string = TZ): LocalParts {
  const parts = fmt(tz).formatToParts(toDate(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const h = Number(get('hour'));
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h: h === 24 ? 0 : h,
    min: Number(get('minute')),
    s: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of the instant in the zone. */
export function localDate(instant: Instant | Date, tz: string = TZ): LocalDate {
  const p = localParts(instant, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** HH:MM of the instant in the zone. */
export function localHHMM(instant: Instant | Date, tz: string = TZ): string {
  const p = localParts(instant, tz);
  return `${pad(p.h)}:${pad(p.min)}`;
}

/** Zone offset in minutes (east positive) at the given instant. */
export function offsetMinutes(instant: Instant | Date, tz: string = TZ): number {
  const d = toDate(instant);
  const p = localParts(d, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - d.getTime()) / 60_000);
}

/** The instant for a local wall-clock time in the zone. */
export function fromLocal(date: LocalDate, hhmm: string, tz: string = TZ): Instant {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, min] = hhmm.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, h, min, 0);
  // First guess with the offset at the naive instant, then correct once for DST edges.
  let guess = naive - offsetMinutes(new Date(naive), tz) * 60_000;
  guess = naive - offsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess).toISOString();
}

export function startOfLocalDay(instant: Instant | Date, tz: string = TZ): Instant {
  return fromLocal(localDate(instant, tz), '00:00', tz);
}

export function addLocalDays(date: LocalDate, n: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d + n);
  const x = new Date(t);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

/** Calendar days from a to b in the zone (b − a), can be negative. */
export function localDaysBetween(a: Instant | Date, b: Instant | Date, tz: string = TZ): number {
  const da = localDate(a, tz);
  const db = localDate(b, tz);
  return daysBetweenLocalDates(da, db);
}

export function daysBetweenLocalDates(a: LocalDate, b: LocalDate): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function minutesBetween(a: Instant | Date, b: Instant | Date): number {
  return (toDate(b).getTime() - toDate(a).getTime()) / 60_000;
}

export function isSameLocalDay(a: Instant | Date, b: Instant | Date, tz: string = TZ): boolean {
  return localDate(a, tz) === localDate(b, tz);
}

/** Monday of the week containing the local date. */
export function weekStartMonday(date: LocalDate): LocalDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun
  const back = (wd + 6) % 7;
  return addLocalDays(date, -back);
}

/** Business days between two local dates (Mon–Fri), b − a, excluding a's day, including b's day if a business day. */
export function businessDaysBetween(a: LocalDate, b: LocalDate): number {
  const n = daysBetweenLocalDates(a, b);
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 1; i <= n; i++) {
    const day = addLocalDays(a, i);
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

export function addMinutes(instant: Instant | Date, min: number): Instant {
  return new Date(toDate(instant).getTime() + min * 60_000).toISOString();
}

export function maxInstant(...xs: Array<Instant | undefined>): Instant | undefined {
  let best: Instant | undefined;
  for (const x of xs) if (x && (!best || toDate(x) > toDate(best))) best = x;
  return best;
}

export function minInstant(...xs: Array<Instant | undefined>): Instant | undefined {
  let best: Instant | undefined;
  for (const x of xs) if (x && (!best || toDate(x) < toDate(best))) best = x;
  return best;
}
