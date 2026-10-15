/**
 * Crew lanes for the TODAY screen. Lane membership, chips and the ACK clock come from the domain
 * (`cardInLane`, `cardState`, `problemAckOverdue`); this file only groups visits by crew and picks
 * which card is the NOW card. Pure; `now` is passed in.
 */
import {
  CONFIG,
  addLocalDays,
  cardInLane,
  cardState,
  localDate,
  localParts,
  problemAckOverdue,
  toDate,
  verdictsByJob,
  type CardState,
  type Crew,
  type Instant,
  type Job,
  type JobVerdicts,
  type Snapshot,
  type Visit,
} from '@sealtech/domain';

export interface LaneCard {
  visit: Visit;
  job: Job;
  state: CardState;
  ackOverdue: boolean;
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
  return { visit, job, state, ackOverdue: problemAckOverdue(visit, now) };
}

/**
 * The NOW card: the visit in progress by the clock (started, not complete, not DONE; the latest if
 * several), else the next not-started one, else the latest finished card that is not DONE, else the last card.
 */
export function pickNow(cards: LaneCard[], now: Instant): LaneCard | undefined {
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
  return { lanes: all.slice(0, CONFIG.MAX_LANES), overflow: all.slice(CONFIG.MAX_LANES).map((l) => l.crew), afterFlip };
}
