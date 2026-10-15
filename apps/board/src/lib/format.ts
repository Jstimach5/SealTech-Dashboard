/** Wall text helpers. Every rule lives in @sealtech/domain; these only print. */
import { fmtTime, localParts, type Instant, type LocalDate } from '@sealtech/domain';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `Wed 14 Oct` */
export function wallDate(instant: Instant): string {
  const p = localParts(instant);
  return `${WEEKDAYS[p.weekday] ?? ''} ${p.d} ${MONTHS[p.m - 1] ?? ''}`;
}

/** `9:30 am` (decision 54: one 12-hour clock style everywhere) */
export function wallTime(instant: Instant): string {
  return fmtTime(instant);
}

/** `Wed 14 Oct · 09:30` */
export function wallClock(instant: Instant): string {
  return `${wallDate(instant)} · ${wallTime(instant)}`;
}

/** `23 Sep` from an instant (local date). */
export function dayMonth(instant: Instant): string {
  const p = localParts(instant);
  return `${p.d} ${MONTHS[p.m - 1] ?? ''}`;
}

/** `5 Oct` from a YYYY-MM-DD local date. */
export function dayMonthOfLocalDate(date: LocalDate): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1] ?? ''}`;
}

/** `8 am–12 pm` */
export function timeRange(startAt: Instant, endAt: Instant): string {
  return `${fmtTime(startAt, true)}–${fmtTime(endAt, true)}`;
}

/** `21 d` */
export function days(n: number): string {
  return `${n} d`;
}

/** A snapshot label `LASTNAME · CITY · SCOPE` split into its parts for width-aware printing. */
export function splitLabel(label: string): { lastName: string; city: string; scope: string } {
  const parts = label.split(' · ');
  return { lastName: parts[0] ?? label, city: parts.slice(1, -1).join(' · '), scope: parts.length > 1 ? (parts[parts.length - 1] ?? '') : '' };
}

export function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)} %`;
}

export function num(n: number | null): string {
  return n === null ? '—' : String(n);
}
