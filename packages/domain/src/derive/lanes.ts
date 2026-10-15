/**
 * Crew lanes (moved from apps/board for revision G so crew rows are table-tested here). Lane membership, chips and the ACK clock come from the domain
 * (`cardInLane`, `cardState`, `problemAckOverdue`); this file only groups visits by crew and picks
 * which card is the NOW card. Pure; `now` is passed in.
 */
import { CONFIG } from '../config.js';
import type { Crew, Instant, Job, Snapshot, Visit } from '../types.js';
import { addLocalDays, localDate, localParts, toDate } from './time.js';
import { cardInLane, cardState, problemAckOverdue, type CardState } from './cards.js';
import { verdictsByJob, type JobVerdicts } from './reviewMatch.js';

export interface LaneCard {
  visit: Visit;
  job: Job;
  state: CardState;
  /** Decision 41: Problem, no ACK, 15 minutes or more since the result (the red border). */
  ackOverdue: boolean;
  /** Decision 41: Problem with no ACK yet (the ACK button shows from the first minute). */
  needsAck: boolean;
}

/** A Problem visit that has no ACK line yet. */
export function needsAck(visit: Visit): boolean {
  return visit.result === 'Problem' && visit.ack === undefined;
}

export interface Lane {
  crew: Crew;
  cards: LaneCard[];
  completed: number;
  now: LaneCard | undefined;
  next: LaneCard[];
  done: LaneCard[];
  tomorrow: LaneCard | undefined;
}

export interface Lanes {
  lanes: Lane[];
  /** Crews with visits today beyond MAX_LANES. */
  overflow: Crew[];
  afterFlip: boolean;
  /** Every crew's lane with visits today, uncapped (crew rows never collapse a crew). */
  all: Lane[];
  /** Crew lead id → that crew's first visit tomorrow, after the 15:00 flip (for crews with no lane today too). */
  tomorrowByCrew?: Record<string, LaneCard | undefined>;
}

function byStart(a: { visit: Visit }, b: { visit: Visit }): number {
  return toDate(a.visit.startAt).getTime() - toDate(b.visit.startAt).getTime();
}

/** The crew a visit belongs to: the first crew whose lead is assigned, else the first crew with any assigned member. */
export function crewOfVisit(visit: Visit, crews: Crew[]): Crew | undefined {
  for (const id of visit.assignedUserIds) {
    const lead = crews.find((c) => c.leadUserId === id);
    if (lead) return lead;
  }
  for (const id of visit.assignedUserIds) {
    const member = crews.find((c) => c.memberUserIds.includes(id));
    if (member) return member;
  }
  return undefined;
}

function toCard(visit: Visit, jobs: Map<string, Job>, verdicts: Record<string, JobVerdicts>, now: Instant): LaneCard | undefined {
  const job = jobs.get(visit.jobId);
  if (!job) return undefined;
  const v = verdicts[job.id];
  const state = cardState({
    visit,
    job,
    ...(v?.latestVerdict !== undefined ? { latestVerdict: v.latestVerdict } : {}),
    pass2Ready: v?.pass2Ready ?? false,
    now,
  });
  return { visit, job, state, ackOverdue: problemAckOverdue(visit, now), needsAck: needsAck(visit) };
}

/**
 * The NOW card: an un-ACKed Problem first (decision 41: it stays the NOW card, with its ACK button
 * and, after 15 minutes, its red border, until an ACK line lands; the earliest if several), else the
 * visit in progress by the clock (started, not complete, not DONE; the latest if several), else the
 * next not-started one, else the latest finished card that is not DONE, else the last card.
 */
export function pickNow(cards: LaneCard[], now: Instant): LaneCard | undefined {
  const problem = cards.find((c) => c.needsAck);
  if (problem) return problem;
  const t = toDate(now).getTime();
  const open = cards.filter((c) => toDate(c.visit.startAt).getTime() <= t && !c.visit.isComplete && c.state.kind !== 'DONE');
  if (open.length > 0) return open[open.length - 1];
  const notStarted = cards.find((c) => c.state.kind === 'NOT STARTED');
  if (notStarted) return notStarted;
  const notDone = cards.filter((c) => c.state.kind !== 'DONE');
  if (notDone.length > 0) return notDone[notDone.length - 1];
  return cards[cards.length - 1];
}

export function deriveLanes(snapshot: Snapshot, now: Instant): Lanes {
  const jobs = new Map(snapshot.jobs.map((j) => [j.id, j]));
  const verdicts = verdictsByJob(snapshot.reviewRows);
  const afterFlip = localParts(now).h >= CONFIG.TOMORROW_FLIP_HOUR;
  const tomorrow = addLocalDays(localDate(now), 1);

  const byCrew = new Map<string, { today: LaneCard[]; tomorrow: LaneCard[] }>();
  for (const crew of snapshot.crews) byCrew.set(crew.leadUserId, { today: [], tomorrow: [] });
  for (const visit of snapshot.visits) {
    const crew = crewOfVisit(visit, snapshot.crews);
    if (!crew) continue;
    const bucket = byCrew.get(crew.leadUserId);
    if (!bucket) continue;
    if (cardInLane(visit, now)) {
      const card = toCard(visit, jobs, verdicts, now);
      if (card) bucket.today.push(card);
    } else if (afterFlip && localDate(visit.startAt) === tomorrow) {
      const card = toCard(visit, jobs, verdicts, now);
      if (card) bucket.tomorrow.push(card);
    }
  }

  const tomorrowByCrew: Record<string, LaneCard | undefined> = {};
  for (const [lead, b] of byCrew) tomorrowByCrew[lead] = [...b.tomorrow].sort(byStart)[0];
  const all: Lane[] = [];
  for (const crew of snapshot.crews) {
    const bucket = byCrew.get(crew.leadUserId);
    if (!bucket || bucket.today.length === 0) continue;
    const cards = [...bucket.today].sort(byStart);
    const nowCard = pickNow(cards, now);
    const nowStart = nowCard ? toDate(nowCard.visit.startAt).getTime() : Number.POSITIVE_INFINITY;
    const next = cards.filter((c) => c !== nowCard && toDate(c.visit.startAt).getTime() > nowStart);
    const done = cards.filter((c) => c !== nowCard && !next.includes(c));
    const tomorrowFirst = [...bucket.tomorrow].sort(byStart)[0];
    all.push({ crew, cards, completed: cards.filter((c) => c.visit.isComplete).length, now: nowCard, next, done, tomorrow: tomorrowFirst });
  }
  return { lanes: all.slice(0, CONFIG.MAX_LANES), overflow: all.slice(CONFIG.MAX_LANES).map((l) => l.crew), afterFlip, all, tomorrowByCrew };
}
