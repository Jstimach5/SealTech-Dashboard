/**
 * Line owners (decision 33): initials defaulted by reason — office for review / paperwork /
 * program-wait, crew lead for access / return / materials — changeable at the huddle through an
 * override. FIX and HOLD lines show a role word (CREW / OFFICE), never initials, so a name never
 * sits beside a quality item on the TV (decision 16). Pure functions; no clock is read here.
 */
import type { AttentionBucket, Reason } from '../enums.js';
import type { Crew, Job, LocalDate, Owner, Person, Visit } from '../types.js';
import { toDate } from './time.js';

/** Decision 33: the reasons a crew lead owns (access / return / materials side of the house). */
const CREW_LEAD_REASONS: ReadonlySet<Reason> = new Set<Reason>(['RETURN NEEDED', 'BLOWER DOOR FAIL', 'FORM/QUANTITIES MISSING']);

/** Decision 33: the reasons the office owns (review / paperwork / program-wait / invoicing). */
const OFFICE_REASONS: ReadonlySet<Reason> = new Set<Reason>([
  'AWAITING 1ST REVIEW',
  'AWAITING 2ND REVIEW',
  'INSPECTION/PERMIT',
  'PROGRAM-WAIT',
  'READY TO INVOICE',
]);

/** Decision 33: the wall prints the initials when a name is allowed, otherwise the role word (CREW / OFFICE). */
export function ownerText(owner: Owner): string {
  return 'initials' in owner ? owner.initials : owner.role;
}

/** Decision 33: the office owner is the first person with role 'office', else the first with role 'owner'. */
export function officeInitials(people: Person[]): string | undefined {
  const office = people.find((p) => p.role === 'office') ?? people.find((p) => p.role === 'owner');
  return office?.initials;
}

/** The visit of this job with the greatest startAt (first listed wins a tie); undefined when the job has none. */
export function latestVisitOf(job: Job, visits: Visit[]): Visit | undefined {
  let latest: Visit | undefined;
  for (const visit of visits) {
    if (visit.jobId !== job.id && !job.visitIds.includes(visit.id)) continue;
    if (!latest || toDate(visit.startAt) > toDate(latest.startAt)) latest = visit;
  }
  return latest;
}

/**
 * Decision 33: crew-lead initials for a visit. The first assigned id that is some crew's leadUserId gives
 * that crew's initials; else the first assigned id that is a known person gives that person's initials;
 * else undefined (the caller falls back to the CREW role word).
 */
export function crewLeadInitialsFor(visit: Visit | undefined, crews: Crew[], people: Person[]): string | undefined {
  if (!visit) return undefined;
  for (const id of visit.assignedUserIds) {
    const crew = crews.find((c) => c.leadUserId === id);
    if (crew) return crew.initials;
  }
  for (const id of visit.assignedUserIds) {
    const person = people.find((p) => p.jobberUserId === id);
    if (person) return person.initials;
  }
  return undefined;
}

/** Decision 33 + 16: FIX OPEN, HOLD and BLOWER DOOR FAIL lines carry a role word only; nothing, not even a huddle override, puts initials on them. */
export function roleOnlyOwner(reason: Reason | undefined): Owner | undefined {
  if (reason === 'FIX OPEN') return { role: 'CREW' };
  if (reason === 'HOLD') return { role: 'OFFICE' };
  // Decision 33: initials never sit beside a rate; a blower-door fail line carries its reduction percentage.
  if (reason === 'BLOWER DOOR FAIL') return { role: 'CREW' };
  return undefined;
}

/** Decision 33: the crew side defaults to the latest visit's crew lead, else the CREW role word. */
function crewOwner(job: Job, visits: Visit[], crews: Crew[], people: Person[]): Owner {
  const initials = crewLeadInitialsFor(latestVisitOf(job, visits), crews, people);
  return initials ? { initials } : { role: 'CREW' };
}

/** Decision 33: the office side defaults to the office person's initials, else the OFFICE role word. */
function officeOwner(people: Person[]): Owner {
  const initials = officeInitials(people);
  return initials ? { initials } : { role: 'OFFICE' };
}

/** Decision 33: crew-lead reasons go to the crew side, every other reason to the office. */
function ownerByReason(reason: Reason, job: Job, visits: Visit[], crews: Crew[], people: Person[]): Owner {
  if (CREW_LEAD_REASONS.has(reason)) return crewOwner(job, visits, crews, people);
  if (OFFICE_REASONS.has(reason)) return officeOwner(people);
  return officeOwner(people);
}

/** Decision 33 over decision 29's strip: a late visit is the crew lead's; action required and requires invoicing are office work. */
function ownerByAttention(kind: AttentionBucket, job: Job, visits: Visit[], crews: Crew[], people: Person[]): Owner {
  if (kind === 'late') return crewOwner(job, visits, crews, people);
  return officeOwner(people);
}

/**
 * Decision 33: the default owner of a cannot-invoice or attention line, in precedence order:
 * FIX / HOLD role word (ignores overrides) → huddle override → owner by reason → owner by attention
 * kind → office. `override.setOn` is carried for the huddle record and does not expire here.
 */
export function defaultOwner(args: {
  reason?: Reason;
  attentionKind?: AttentionBucket;
  job: Job;
  visits: Visit[];
  crews: Crew[];
  people: Person[];
  override?: { initials: string; setOn: LocalDate };
}): Owner {
  const { reason, attentionKind, job, visits, crews, people, override } = args;
  const roleOnly = roleOnlyOwner(reason);
  if (roleOnly) return roleOnly;
  if (override) return { initials: override.initials };
  if (reason) return ownerByReason(reason, job, visits, crews, people);
  if (attentionKind) return ownerByAttention(attentionKind, job, visits, crews, people);
  return officeOwner(people);
}
