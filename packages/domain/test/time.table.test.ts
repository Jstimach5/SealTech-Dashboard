import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  businessDaysBetween,
  fromLocal,
  localDate,
  localDaysBetween,
  localHHMM,
  minutesBetween,
  offsetMinutes,
  startOfLocalDay,
  weekStartMonday,
} from '../src/derive/time.js';

describe('time helpers (America/Detroit)', () => {
  it.each([
    // instant (UTC) → local date, local HH:MM, offset
    ['2026-10-14T11:00:00Z', '2026-10-14', '07:00', -240], // EDT
    ['2026-10-14T03:59:59Z', '2026-10-13', '23:59', -240], // just before local midnight
    ['2026-10-14T04:00:00Z', '2026-10-14', '00:00', -240],
    ['2026-01-15T12:00:00Z', '2026-01-15', '07:00', -300], // EST
    ['2026-11-01T05:30:00Z', '2026-11-01', '01:30', -240], // before fall-back at 2:00 EDT
    ['2026-11-01T06:30:00Z', '2026-11-01', '01:30', -300], // after fall-back, 1:30 again, EST
  ])('%s → %s %s offset %i', (instant, date, hhmm, off) => {
    expect(localDate(instant)).toBe(date);
    expect(localHHMM(instant)).toBe(hhmm);
    expect(offsetMinutes(instant)).toBe(off);
  });

  it.each([
    ['2026-10-14', '07:00', '2026-10-14T11:00:00.000Z'],
    ['2026-10-14', '00:00', '2026-10-14T04:00:00.000Z'],
    ['2026-01-15', '07:00', '2026-01-15T12:00:00.000Z'],
    ['2026-03-08', '03:00', '2026-03-08T07:00:00.000Z'], // after spring-forward
  ])('fromLocal(%s %s) = %s', (date, hhmm, expected) => {
    expect(fromLocal(date, hhmm)).toBe(expected);
  });

  it('startOfLocalDay rolls to local midnight', () => {
    expect(startOfLocalDay('2026-10-14T23:30:00Z')).toBe('2026-10-14T04:00:00.000Z');
    expect(startOfLocalDay('2026-10-14T03:30:00Z')).toBe('2026-10-13T04:00:00.000Z');
  });

  it.each([
    ['2026-10-14T11:00:00Z', '2026-10-14T23:00:00Z', 0],
    ['2026-10-14T11:00:00Z', '2026-10-15T03:00:00Z', 0], // 23:00 local same day
    ['2026-10-14T11:00:00Z', '2026-10-15T04:00:00Z', 1], // 00:00 local next day
    ['2026-10-07T11:00:00Z', '2026-10-14T11:00:00Z', 7],
    ['2026-10-14T11:00:00Z', '2026-10-07T11:00:00Z', -7],
  ])('localDaysBetween(%s, %s) = %i', (a, b, n) => {
    expect(localDaysBetween(a, b)).toBe(n);
  });

  it('minutesBetween is signed', () => {
    expect(minutesBetween('2026-10-14T11:00:00Z', '2026-10-14T11:45:00Z')).toBe(45);
    expect(minutesBetween('2026-10-14T11:45:00Z', '2026-10-14T11:00:00Z')).toBe(-45);
  });

  it.each([
    ['2026-10-14', '2026-10-12'], // Wed → Mon
    ['2026-10-12', '2026-10-12'], // Mon
    ['2026-10-18', '2026-10-12'], // Sun → previous Mon
  ])('weekStartMonday(%s) = %s', (d, mon) => {
    expect(weekStartMonday(d)).toBe(mon);
  });

  it('addLocalDays crosses month ends', () => {
    expect(addLocalDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it.each([
    ['2026-10-14', '2026-10-15', 1], // Wed → Thu
    ['2026-10-16', '2026-10-19', 1], // Fri → Mon
    ['2026-10-14', '2026-10-21', 5],
    ['2026-10-14', '2026-10-14', 0],
    ['2026-10-14', '2026-10-13', 0],
  ])('businessDaysBetween(%s, %s) = %i', (a, b, n) => {
    expect(businessDaysBetween(a, b)).toBe(n);
  });
});
