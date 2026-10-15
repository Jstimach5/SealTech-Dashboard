/**
 * TESTVILLE — the fictional dataset the prototype runs on (owner decision 24).
 *
 * Every id carries `-test-` so live writers refuse it. Every job title follows the house
 * convention `TESTVILLE - TOKEN TYPE - LAST`. Times are offsets from `now` so the same
 * dataset renders correctly for any board date; `FIXTURE_NOW` freezes the clock.
 *
 * What the default dataset shows (board date = D, default now = 09:30 local):
 *   lanes      ASHBY: NGUYEN Problem with no ACK (red border after 15 min), next OKAFOR
 *              BRANT: ROWE day 2 of 2 in progress (day 1 yesterday was Prepped = kept)
 *              CORDER: MBEKI DONE (READY twice + invoiced, grey), next IBRAHIM
 *              DALE: SANTOS in progress, next PATEL
 *   strip      VARGA (late 2 d), HOLT (action required 1 d), then the oldest requires-invoicing lines
 *   rail       one line for each of the ten cannot-invoice reasons plus BAUER, the 21-day no-reminder leak
 *   scoreline  yesterday kept 5 of 7 (2 unknown): ROWE day 1, CARTER, FOSTER, MORGAN, ELLIS kept;
 *              DIAZ materials; QUINN weather; BAKER cancelled (excluded); GREENE, ALVAREZ unknown
 *   review     CARTER inferred from the file stem; NOVAK twin-surname row unmatched
 */
import {
  addLocalDays,
  formatAckLine,
  formatCloseLine,
  formatVisitResultLine,
  fromLocal,
  localDate,
  parseTitle,
  type Bucket,
  type Crew,
  type Instant,
  type Job,
  type MissReason,
  type NoteLine,
  type Person,
  type ReviewRow,
  type Scope,
  type ScorecardRow,
  type SourceInputs,
  type Verdict,
  type Visit,
  type VisitResult,
  weekStartMonday,
} from '@sealtech/domain';

export const FIXTURE_BUILD = 'fixtures';

// ---------------------------------------------------------------------------------------
// People and crews
// ---------------------------------------------------------------------------------------

export const PEOPLE: Person[] = [
  { jobberUserId: 'u-test-owner', lastName: 'TESTOWNER', initials: 'JT', role: 'owner', reviewPass: 2 },
  { jobberUserId: 'u-test-office', lastName: 'TESTOFFICE', initials: 'JA', role: 'office', reviewPass: 0 },
  { jobberUserId: 'u-test-intake', lastName: 'TESTINTAKE', initials: 'KA', role: 'office', reviewPass: 0 },
  { jobberUserId: 'u-test-ashby', lastName: 'ASHBY', initials: 'HA', role: 'crewLead', reviewPass: 1 },
  { jobberUserId: 'u-test-brant', lastName: 'BRANT', initials: 'AB', role: 'crewLead', reviewPass: 0 },
  { jobberUserId: 'u-test-corder', lastName: 'CORDER', initials: 'MC', role: 'crewLead', reviewPass: 0 },
  { jobberUserId: 'u-test-dale', lastName: 'DALE', initials: 'TD', role: 'crewLead', reviewPass: 0 },
  { jobberUserId: 'u-test-a2', lastName: 'ASHBY-2', initials: 'A2', role: 'crew', reviewPass: 0 },
  { jobberUserId: 'u-test-b2', lastName: 'BRANT-2', initials: 'B2', role: 'crew', reviewPass: 0 },
  { jobberUserId: 'u-test-c2', lastName: 'CORDER-2', initials: 'C2', role: 'crew', reviewPass: 0 },
  { jobberUserId: 'u-test-d2', lastName: 'DALE-2', initials: 'D2', role: 'crew', reviewPass: 0 },
];

export const CREWS: Crew[] = [
  { leadUserId: 'u-test-ashby', leadLastName: 'ASHBY', initials: 'HA', memberUserIds: ['u-test-ashby', 'u-test-a2'] },
  { leadUserId: 'u-test-brant', leadLastName: 'BRANT', initials: 'AB', memberUserIds: ['u-test-brant', 'u-test-b2'] },
  { leadUserId: 'u-test-corder', leadLastName: 'CORDER', initials: 'MC', memberUserIds: ['u-test-corder', 'u-test-c2'] },
  { leadUserId: 'u-test-dale', leadLastName: 'DALE', initials: 'TD', memberUserIds: ['u-test-dale', 'u-test-d2'] },
];

const CREW_IDS: Record<string, string[]> = Object.fromEntries(CREWS.map((c) => [c.leadLastName, c.memberUserIds]));

// ---------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------

export interface Clock {
  now: Instant;
  boardDate: string;
  /** Instant for local `hhmm` on board date + `dayOffset`. */
  at(dayOffset: number, hhmm: string): Instant;
  /** Local date for board date + `dayOffset`. */
  day(dayOffset: number): string;
}

export function clock(now: Instant): Clock {
  const boardDate = localDate(now);
  return {
    now,
    boardDate,
    at: (dayOffset, hhmm) => fromLocal(addLocalDays(boardDate, dayOffset), hhmm),
    day: (dayOffset) => addLocalDays(boardDate, dayOffset),
  };
}

interface JobSpec {
  key: string;
  number: number;
  title: string;
  bucket: Bucket;
  /** Days ago the bucket was first observed; omitted = unobserved (falls back to updatedAt). */
  bucketSeenDaysAgo?: number;
  completedAt?: Instant;
  updatedAt?: Instant;
  invoiced?: boolean;
  isZeroTotal?: boolean;
  hasUninvoicedWork?: boolean;
  remindersOff?: boolean;
  futureVisitCount?: number;
  permitStatus?: string;
  companyCamUrl?: string;
  notes?: NoteLine[];
  instructions?: string;
  /** Overrides the scope parsed from the title (e.g. a blower-door-only visit). */
  scope?: Scope;
}

function job(c: Clock, s: JobSpec): Job {
  const parsed = parseTitle({ title: s.title, ...(s.instructions ? { instructions: s.instructions } : {}) });
  const updatedAt = s.updatedAt ?? s.completedAt ?? c.at(-1, '17:00');
  return {
    id: `j-test-${s.key}`,
    jobNumber: s.number,
    title: s.title,
    lastName: parsed.lastName,
    city: parsed.city,
    scope: s.scope ?? parsed.scope,
    program: parsed.program,
    bucket: s.bucket,
    bucketSince: s.bucketSeenDaysAgo !== undefined ? c.at(-s.bucketSeenDaysAgo, '08:00') : updatedAt,
    bucketSinceSource: s.bucketSeenDaysAgo !== undefined ? 'observed' : 'updatedAt',
    ...(s.completedAt ? { completedAt: s.completedAt } : {}),
    updatedAt,
    ...(s.companyCamUrl ? { companyCamUrl: s.companyCamUrl } : {}),
    ...(s.permitStatus ? { permitStatus: s.permitStatus } : {}),
    invoiced: s.invoiced ?? false,
    isZeroTotal: s.isZeroTotal ?? false,
    hasUninvoicedWork: s.hasUninvoicedWork ?? !(s.invoiced ?? false),
    ...(s.remindersOff !== undefined ? { remindersOff: s.remindersOff } : {}),
    futureVisitCount: s.futureVisitCount ?? 0,
    visitIds: [],
    noteLines: s.notes ?? [],
  };
}

interface VisitSpec {
  jobKey: string;
  n?: number;
  crew: keyof typeof CREW_IDS;
  day: number;
  start: string;
  end: string;
  createdDaysBefore?: number;
  completedAt?: Instant;
  isLast?: boolean;
  forms?: { seen: number; incomplete: number };
  instructions?: string;
}

function visit(c: Clock, s: VisitSpec): Visit {
  const n = s.n ?? 1;
  return {
    id: `v-test-${s.jobKey}-${n}`,
    jobId: `j-test-${s.jobKey}`,
    startAt: c.at(s.day, s.start),
    endAt: c.at(s.day, s.end),
    createdAt: c.at(s.day - (s.createdDaysBefore ?? 7), '10:00'),
    ...(s.completedAt ? { completedAt: s.completedAt } : {}),
    isComplete: Boolean(s.completedAt),
    isLastScheduledVisit: s.isLast ?? true,
    incompleteJobFormsCount: s.forms?.incomplete ?? 0,
    formsSeenMax: s.forms?.seen ?? 0,
    assignedUserIds: CREW_IDS[s.crew] ?? [],
    ...(s.instructions ? { instructions: s.instructions } : {}),
    plannedAsPrep: false,
    resultSource: 'unknown',
  };
}

interface RowSpec {
  jobKey?: string;
  application: string;
  installDay: number;
  tech: string;
  jobDesc: string;
  verdict?: Verdict;
  fix?: string;
  hold?: string;
  notes?: string;
  blower?: string;
  status?: ReviewRow['status'];
  ownerNotes?: string;
  pass?: 1 | 2;
  reviewer?: string;
  reviewedAt?: Instant;
  checkedDay?: number;
  submittedDay?: number;
  acceptedDay?: number;
  returnedDay?: number;
  returnedReason?: string;
  /** Write the Jobber key columns (exact match). Checker rows do not have them yet. */
  keyed?: boolean;
  jobNumber?: number;
}

function row(c: Clock, index: number, s: RowSpec): ReviewRow {
  return {
    rowIndex: index,
    checked: c.day(s.checkedDay ?? (s.reviewedAt ? 0 : s.installDay + 1)),
    application: s.application,
    installDate: c.day(s.installDay),
    tech: s.tech,
    jobDesc: s.jobDesc,
    ...(s.verdict ? { verdict: s.verdict } : {}),
    ...(s.fix ? { fixBeforeSubmitting: s.fix } : {}),
    ...(s.hold ? { holdReason: s.hold } : {}),
    ...(s.notes ? { reviewNotes: s.notes } : {}),
    ...(s.blower ? { blowerDoorPrePost: s.blower } : {}),
    ...(s.status !== undefined ? { status: s.status } : {}),
    ...(s.ownerNotes ? { ownerNotes: s.ownerNotes } : {}),
    ...(s.keyed && s.jobKey ? { jobberJobId: `j-test-${s.jobKey}` } : {}),
    ...(s.keyed && s.jobNumber !== undefined ? { jobNumber: s.jobNumber } : {}),
    ...(s.pass ? { pass: s.pass } : {}),
    ...(s.reviewer ? { reviewerUserId: s.reviewer } : {}),
    ...(s.reviewedAt ? { reviewedAt: s.reviewedAt } : {}),
    ...(s.submittedDay !== undefined ? { submittedDate: c.day(s.submittedDay) } : {}),
    ...(s.acceptedDay !== undefined ? { acceptedDate: c.day(s.acceptedDay) } : {}),
    ...(s.returnedDay !== undefined ? { returnedDate: c.day(s.returnedDay) } : {}),
    ...(s.returnedReason ? { returnedReason: s.returnedReason } : {}),
    match: 'none',
  };
}

const note = (at: Instant, text: string): NoteLine => ({ at, text });
const resultNote = (at: Instant, result: VisitResult, reason?: MissReason, text?: string): NoteLine =>
  note(at, formatVisitResultLine(result, reason, text));
const closeNote = (at: Instant, code: Parameters<typeof formatCloseLine>[0], reason?: MissReason): NoteLine =>
  note(at, formatCloseLine(code, reason));

// ---------------------------------------------------------------------------------------
// The dataset
// ---------------------------------------------------------------------------------------

export function testvilleInputs(now: Instant): SourceInputs {
  const c = clock(now);
  const T = 'TESTVILLE';

  const jobs: Job[] = [
    // ---- today's lanes ------------------------------------------------------------
    job(c, {
      key: 'nguyen', number: 9001, title: `${T} - CONSUMERS INSTALL - NGUYEN`, bucket: 'today',
      notes: [resultNote(c.at(0, '09:05'), 'Problem', 'ACCESS', 'crawlspace flooded, cannot enter')],
      companyCamUrl: 'https://app.companycam.com/projects/test-nguyen',
    }),
    job(c, {
      key: 'rowe', number: 9002, title: `${T} - CONSUMERS INSTALL - ROWE`, bucket: 'today',
      notes: [closeNote(c.at(-1, '16:05'), 'PR')],
    }),
    job(c, {
      key: 'mbeki', number: 9003, title: `${T} - CONSUMERS BD - MBEKI`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 0,
      completedAt: c.at(0, '08:30'), invoiced: true, hasUninvoicedWork: false, scope: 'BD',
      companyCamUrl: 'https://app.companycam.com/projects/test-mbeki',
    }),
    job(c, { key: 'santos', number: 9004, title: `${T} - STD INSTALL - SANTOS`, bucket: 'today' }),
    job(c, { key: 'patel', number: 9005, title: `${T} - CONSUMERS INSTALL - PATEL`, bucket: 'today' }),
    job(c, { key: 'okafor', number: 9006, title: `${T} - CONSUMERS HVAC EVAL - OKAFOR`, bucket: 'today' }),
    job(c, { key: 'ibrahim', number: 9007, title: `${T} - CONSUMERS INSTALL - IBRAHIM`, bucket: 'today', instructions: 'air seal attic' }),

    // ---- attention strip -----------------------------------------------------------
    job(c, { key: 'varga', number: 9008, title: `${T} - CONSUMERS INSTALL - VARGA`, bucket: 'late', bucketSeenDaysAgo: 2 }),
    job(c, { key: 'holt', number: 9009, title: `${T} - STD INSTALL - HOLT`, bucket: 'action_required', bucketSeenDaysAgo: 1 }),

    // ---- cannot-invoice rail: one job per reason -----------------------------------
    job(c, { key: 'carter', number: 9010, title: `${T} - CONSUMERS INSTALL - CARTER`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 0, completedAt: c.at(-1, '12:10') }),
    job(c, { key: 'ellis', number: 9011, title: `${T} - CONSUMERS INSTALL - ELLIS`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 1, completedAt: c.at(-1, '15:40') }),
    job(c, { key: 'osei', number: 9012, title: `${T} - CONSUMERS INSTALL - OSEI`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 5, completedAt: c.at(-5, '15:00') }),
    job(c, { key: 'price', number: 9013, title: `${T} - CONSUMERS WALLS - PRICE`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 12, completedAt: c.at(-12, '14:30') }),
    job(c, { key: 'diaz', number: 9014, title: `${T} - CONSUMERS INSTALL - DIAZ`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 0, completedAt: c.at(-1, '11:45') }),
    job(c, { key: 'weiss', number: 9015, title: `${T} - CONSUMERS INSTALL - WEISS`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 2, completedAt: c.at(-2, '15:20') }),
    job(c, {
      key: 'rossi', number: 9016, title: `${T} - CONSUMERS INSTALL - ROSSI`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 2, completedAt: c.at(-2, '16:00'),
      notes: [closeNote(c.at(-2, '16:30'), 'C')],
    }),
    job(c, {
      key: 'farah', number: 9017, title: `${T} - CONSUMERS HVAC REPLACEMENT - FARAH`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 9,
      completedAt: c.at(-9, '16:00'), permitStatus: 'Inspection scheduled',
    }),
    job(c, { key: 'lindqvist', number: 9018, title: `${T} - CONSUMERS INSTALL - LINDQVIST`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 15, completedAt: c.at(-15, '15:00') }),
    job(c, { key: 'kowalski', number: 9019, title: `${T} - CONSUMERS INSTALL - KOWALSKI`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 3, completedAt: c.at(-3, '14:00') }),
    job(c, { key: 'novak-b', number: 9020, title: `${T} - CONSUMERS INSTALL - NOVAK`, bucket: 'requires_invoicing', bucketSeenDaysAgo: 3, completedAt: c.at(-3, '16:10') }),
    job(c, { key: 'novak-a', number: 8990, title: `${T} - STD INSTALL - NOVAK`, bucket: 'archived', completedAt: c.at(-4, '15:00'), invoiced: true, hasUninvoicedWork: false }),
    // The leak: completed 21 days ago, "As needed, no reminders" set, so Jobber never flagged it.
    job(c, {
      key: 'bauer', number: 8975, title: `${T} - CONSUMERS INSTALL - BAUER`, bucket: 'unscheduled', completedAt: c.at(-21, '15:30'),
      remindersOff: true, hasUninvoicedWork: true, isZeroTotal: false,
    }),

    // ---- yesterday (scoreline) -------------------------------------------------------
    job(c, { key: 'foster', number: 9021, title: `${T} - STD INSTALL - FOSTER`, bucket: 'archived', completedAt: c.at(-1, '15:50'), invoiced: true, hasUninvoicedWork: false, notes: [closeNote(c.at(-1, '16:10'), 'C')] }),
    job(c, { key: 'morgan', number: 9022, title: `${T} - SERVICE CALL - MORGAN`, bucket: 'archived', completedAt: c.at(-1, '17:05'), invoiced: true, hasUninvoicedWork: false, notes: [closeNote(c.at(-1, '17:10'), 'CM')] }),
    job(c, { key: 'baker', number: 9023, title: `${T} - CONSUMERS INSTALL - BAKER`, bucket: 'unscheduled', notes: [closeNote(c.at(-1, '10:15'), 'RS')] }),
    job(c, { key: 'quinn', number: 9024, title: `${T} - CONSUMERS INSTALL - QUINN`, bucket: 'upcoming', futureVisitCount: 1, notes: [closeNote(c.at(-1, '16:20'), 'NW-W', 'WEATHER')] }),
    job(c, { key: 'greene', number: 9025, title: `${T} - CONSUMERS WALLS - GREENE`, bucket: 'upcoming', futureVisitCount: 1 }),
    job(c, { key: 'alvarez', number: 9026, title: `${T} - CONSUMERS INSTALL - ALVAREZ`, bucket: 'upcoming', futureVisitCount: 1 }),

    // ---- tomorrow and the rest -------------------------------------------------------
    job(c, { key: 'lee', number: 9027, title: `${T} - CONSUMERS INSTALL - LEE`, bucket: 'upcoming', futureVisitCount: 1 }),
    job(c, { key: 'tanaka', number: 9028, title: `${T} - STD HVAC - TANAKA`, bucket: 'upcoming', futureVisitCount: 1 }),
    job(c, { key: 'zhang', number: 9029, title: `${T} - CONSUMERS INSTALL - ZHANG`, bucket: 'on_hold' }),
  ];

  const visits: Visit[] = [
    // today
    visit(c, { jobKey: 'nguyen', crew: 'ASHBY', day: 0, start: '08:00', end: '12:00', forms: { seen: 1, incomplete: 1 } }),
    visit(c, { jobKey: 'okafor', crew: 'ASHBY', day: 0, start: '13:00', end: '17:00' }),
    visit(c, { jobKey: 'rowe', n: 1, crew: 'BRANT', day: -1, start: '08:00', end: '16:00', isLast: false, completedAt: c.at(-1, '16:00'), forms: { seen: 1, incomplete: 1 }, instructions: 'PR: day 1 of 2' }),
    visit(c, { jobKey: 'rowe', n: 2, crew: 'BRANT', day: 0, start: '08:00', end: '15:00', isLast: true, instructions: 'PR: day 2 of 2' }),
    visit(c, { jobKey: 'mbeki', crew: 'CORDER', day: 0, start: '07:00', end: '08:30', completedAt: c.at(0, '08:30'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'ibrahim', crew: 'CORDER', day: 0, start: '10:00', end: '14:00', instructions: 'air seal attic' }),
    visit(c, { jobKey: 'santos', crew: 'DALE', day: 0, start: '08:30', end: '12:30' }),
    visit(c, { jobKey: 'patel', crew: 'DALE', day: 0, start: '13:00', end: '16:00' }),
    // yesterday
    visit(c, { jobKey: 'carter', crew: 'ASHBY', day: -1, start: '08:00', end: '12:00', completedAt: c.at(-1, '12:10'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'foster', crew: 'ASHBY', day: -1, start: '13:00', end: '16:00', completedAt: c.at(-1, '15:50'), forms: { seen: 1, incomplete: 1 } }),
    visit(c, { jobKey: 'morgan', crew: 'ASHBY', day: -1, start: '16:15', end: '17:00', completedAt: c.at(-1, '17:05') }),
    visit(c, { jobKey: 'diaz', crew: 'CORDER', day: -1, start: '08:00', end: '12:00', completedAt: c.at(-1, '11:45'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'alvarez', crew: 'CORDER', day: -1, start: '13:00', end: '16:00', isLast: false, completedAt: c.at(-1, '16:05') }),
    visit(c, { jobKey: 'baker', crew: 'DALE', day: -1, start: '08:00', end: '10:00' }),
    visit(c, { jobKey: 'greene', crew: 'DALE', day: -1, start: '10:00', end: '13:00', isLast: false, completedAt: c.at(-1, '13:05'), forms: { seen: 1, incomplete: 1 } }),
    visit(c, { jobKey: 'quinn', n: 1, crew: 'DALE', day: -1, start: '13:00', end: '16:00' }),
    visit(c, { jobKey: 'ellis', crew: 'BRANT', day: -1, start: '07:00', end: '07:45', completedAt: c.at(-1, '15:40'), forms: { seen: 1, incomplete: 0 } }),
    // tomorrow
    visit(c, { jobKey: 'quinn', n: 2, crew: 'DALE', day: 1, start: '08:00', end: '12:00', createdDaysBefore: 0 }),
    visit(c, { jobKey: 'lee', crew: 'ASHBY', day: 1, start: '08:00', end: '16:00' }),
    visit(c, { jobKey: 'tanaka', crew: 'CORDER', day: 1, start: '08:00', end: '12:00' }),
    visit(c, { jobKey: 'greene', n: 2, crew: 'DALE', day: 6, start: '08:00', end: '12:00', createdDaysBefore: 10 }),
    visit(c, { jobKey: 'alvarez', n: 2, crew: 'CORDER', day: 7, start: '08:00', end: '12:00', createdDaysBefore: 10 }),
    // older visits on requires-invoicing / late jobs (the service fetches these too)
    visit(c, { jobKey: 'varga', crew: 'BRANT', day: -3, start: '08:00', end: '16:00' }),
    visit(c, { jobKey: 'osei', crew: 'CORDER', day: -5, start: '08:00', end: '15:00', completedAt: c.at(-5, '15:00'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'price', crew: 'DALE', day: -12, start: '08:00', end: '14:30', completedAt: c.at(-12, '14:30'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'weiss', crew: 'CORDER', day: -2, start: '08:00', end: '15:00', completedAt: c.at(-2, '15:20'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'rossi', crew: 'BRANT', day: -2, start: '08:00', end: '16:00', completedAt: c.at(-2, '16:00'), forms: { seen: 1, incomplete: 1 } }),
    visit(c, { jobKey: 'farah', crew: 'DALE', day: -9, start: '08:00', end: '16:00', completedAt: c.at(-9, '16:00'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'lindqvist', crew: 'ASHBY', day: -15, start: '08:00', end: '15:00', completedAt: c.at(-15, '15:00'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'kowalski', crew: 'BRANT', day: -3, start: '08:00', end: '14:00', completedAt: c.at(-3, '14:00'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'novak-b', crew: 'ASHBY', day: -3, start: '08:00', end: '16:00', completedAt: c.at(-3, '16:10'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'novak-a', crew: 'DALE', day: -4, start: '08:00', end: '15:00', completedAt: c.at(-4, '15:00'), forms: { seen: 1, incomplete: 0 } }),
    visit(c, { jobKey: 'bauer', crew: 'CORDER', day: -21, start: '08:00', end: '15:30', completedAt: c.at(-21, '15:30'), forms: { seen: 1, incomplete: 0 } }),
  ];
  for (const v of visits) jobs.find((j) => j.id === v.jobId)?.visitIds.push(v.id);

  const sti = (type: string, last: string) => `STI_${type}_${last}_TESTVILLE_APP.pdf`;
  const rows: ReviewRow[] = [
    // checker rows (no pass, no key): matched by file stem + install date
    { jobKey: 'carter', application: sti('ATTIC', 'CARTER'), installDay: -1, tech: 'Ashby', jobDesc: 'Attic insulation + air seal', verdict: 'READY', notes: 'All 9 photo types present' },
    { jobKey: 'weiss', application: sti('ATTIC', 'WEISS'), installDay: -2, tech: 'Corder', jobDesc: 'Attic insulation', verdict: 'FIX', fix: 'Blower-door reading not photographed', status: 'Fixed', blower: '1,412 > 1,190' },
    { jobKey: 'rossi', application: sti('ATTIC', 'ROSSI'), installDay: -2, tech: 'Brant', jobDesc: 'Attic insulation', verdict: 'READY' },
    { application: sti('ATTIC', 'NOVAK'), installDay: -3, tech: 'Ashby', jobDesc: 'Attic insulation', verdict: 'READY', notes: 'twin surname: two NOVAK jobs completed this week' },
    // human verdicts (keyed, identity-stamped)
    { jobKey: 'osei', jobNumber: 9012, keyed: true, application: sti('ATTIC', 'OSEI'), installDay: -5, tech: 'Corder', jobDesc: 'Attic insulation', verdict: 'FIX', fix: 'No depth marker or ruler', pass: 1, reviewer: 'u-test-ashby', reviewedAt: c.at(-4, '16:20') },
    { jobKey: 'price', jobNumber: 9013, keyed: true, application: sti('WALL', 'PRICE'), installDay: -12, tech: 'Dale', jobDesc: 'Dense-pack walls', verdict: 'HOLD', hold: 'Owner to confirm add-on scope with customer', pass: 1, reviewer: 'u-test-ashby', reviewedAt: c.at(-11, '16:05') },
    { jobKey: 'farah', jobNumber: 9017, keyed: true, application: sti('HVAC', 'FARAH'), installDay: -9, tech: 'Dale', jobDesc: 'Furnace replacement', verdict: 'HOLD', hold: 'Inspection scheduled, certificate after pass', pass: 1, reviewer: 'u-test-ashby', reviewedAt: c.at(-8, '16:10') },
    { jobKey: 'lindqvist', jobNumber: 9018, keyed: true, application: sti('ATTIC', 'LINDQVIST'), installDay: -15, tech: 'Ashby', jobDesc: 'Attic insulation', verdict: 'READY', pass: 1, reviewer: 'u-test-ashby', reviewedAt: c.at(-14, '16:00') },
    { jobKey: 'lindqvist', jobNumber: 9018, keyed: true, application: sti('ATTIC', 'LINDQVIST'), installDay: -15, tech: 'Ashby', jobDesc: 'Attic insulation', verdict: 'READY', pass: 2, reviewer: 'u-test-owner', reviewedAt: c.at(-13, '16:40'), submittedDay: -12, status: 'Submitted' },
    { jobKey: 'weiss', jobNumber: 9015, keyed: true, application: sti('ATTIC', 'WEISS'), installDay: -2, tech: 'Corder', jobDesc: 'Attic insulation', verdict: 'FIX', fix: 'Blower-door reading not photographed', status: 'Fixed', pass: 1, reviewer: 'u-test-ashby', reviewedAt: c.at(-1, '16:00') },
    { jobKey: 'kowalski', jobNumber: 9019, keyed: true, application: sti('ATTIC', 'KOWALSKI'), installDay: -3, tech: 'Brant', jobDesc: 'Attic insulation', verdict: 'READY', pass: 1, reviewer: 'u-test-ashby', reviewedAt: c.at(-2, '16:15') },
    { jobKey: 'kowalski', jobNumber: 9019, keyed: true, application: sti('ATTIC', 'KOWALSKI'), installDay: -3, tech: 'Brant', jobDesc: 'Attic insulation', verdict: 'READY', pass: 2, reviewer: 'u-test-owner', reviewedAt: c.at(-1, '16:50') },
    { jobKey: 'ellis', jobNumber: 9011, keyed: true, application: sti('ATTIC', 'ELLIS'), installDay: -1, tech: 'Brant', jobDesc: 'Attic insulation', verdict: 'READY', pass: 1, reviewer: 'u-test-ashby', reviewedAt: c.at(0, '08:50') },
    { jobKey: 'mbeki', jobNumber: 9003, keyed: true, application: sti('BD', 'MBEKI'), installDay: 0, tech: 'Corder', jobDesc: 'Blower door test', verdict: 'READY', pass: 1, reviewer: 'u-test-ashby', reviewedAt: c.at(0, '09:05'), blower: '2,094 > 1,439 (31.3%)' },
    { jobKey: 'mbeki', jobNumber: 9003, keyed: true, application: sti('BD', 'MBEKI'), installDay: 0, tech: 'Corder', jobDesc: 'Blower door test', verdict: 'READY', pass: 2, reviewer: 'u-test-owner', reviewedAt: c.at(0, '09:15') },
  ].map((s, i) => row(c, i + 2, s as RowSpec));

  const scorecard: ScorecardRow[] = [-2, -1].map((w) => {
    const weekStart = addLocalDays(weekStartMonday(c.boardDate), 7 * w);
    return {
      weekStart,
      planKeptPct: w === -2 ? 72 : 78,
      answeredPct: w === -2 ? 81 : 88,
      firstPassReadyPct: w === -2 ? 60 : 71,
      photoCompletePct: null,
      cannotInvoiceCount: w === -2 ? 9 : 11,
      cannotInvoiceOldestDays: w === -2 ? 17 : 19,
      daysToSubmitMedian: w === -2 ? 6 : 5,
      daysToSubmitP90: w === -2 ? 14 : 12,
      firstTimeAcceptancePct: null,
      perCrewFirstPass: { HA: { ready: 3, total: 4 }, AB: { ready: 2, total: 3 }, MC: { ready: 2, total: 4 }, TD: { ready: 1, total: 3 } },
    };
  });

  const oneMinuteAgo = new Date(new Date(now).getTime() - 60_000).toISOString();
  const requiresInvoicing = jobs.filter((j) => j.bucket === 'requires_invoicing').length;

  return {
    now,
    mode: 'fixtures',
    build: FIXTURE_BUILD,
    focusLine: 'PHOTOS BEFORE YOU LEAVE',
    responderInitials: 'JA',
    boardOwnerInitials: 'JT',
    people: PEOPLE,
    crews: CREWS,
    jobs,
    visits,
    reviewRows: rows,
    formAnswers: {
      'v-test-mbeki-1': { result: 'Completed', at: c.at(0, '08:30') },
      'v-test-carter-1': { result: 'Completed', at: c.at(-1, '12:10') },
      'v-test-diaz-1': { result: 'Return needed', at: c.at(-1, '11:45'), missReason: 'MATERIALS' },
      'v-test-ellis-1': { result: 'Completed', at: c.at(-1, '15:40') },
      'v-test-osei-1': { result: 'Completed', at: c.at(-5, '15:00') },
      'v-test-price-1': { result: 'Completed', at: c.at(-12, '14:30') },
      'v-test-weiss-1': { result: 'Completed', at: c.at(-2, '15:20') },
      'v-test-farah-1': { result: 'Completed', at: c.at(-9, '16:00') },
      'v-test-lindqvist-1': { result: 'Completed', at: c.at(-15, '15:00') },
      'v-test-kowalski-1': { result: 'Completed', at: c.at(-3, '14:00') },
      'v-test-novak-b-1': { result: 'Completed', at: c.at(-3, '16:10') },
      'v-test-novak-a-1': { result: 'Completed', at: c.at(-4, '15:00') },
      'v-test-bauer-1': { result: 'Completed', at: c.at(-21, '15:30') },
    },
    queuedRecaps: {},
    ownerOverrides: { 'j-test-farah': { initials: 'KA', setOn: c.day(-1) } },
    sources: {
      jobber: { connected: true, ok: true, lastOkAt: oneMinuteAgo, lastAttemptAt: oneMinuteAgo },
      reviewSheet: { connected: true, ok: true, lastOkAt: oneMinuteAgo, lastAttemptAt: oneMinuteAgo },
      flagsSheet: { connected: true, ok: true, lastOkAt: oneMinuteAgo, lastAttemptAt: oneMinuteAgo },
      companyCam: { connected: false, ok: false },
    },
    queuedWrites: [],
    cardMeta: {
      'v-test-mbeki-1': { photosCount: 14, lastCaptureAt: c.at(0, '08:10'), synced: 'jobber' },
      'v-test-nguyen-1': { photosCount: 3, lastCaptureAt: c.at(0, '08:40'), synced: 'none' },
    },
    scorecard,
    jobberRequiresInvoicingCount: requiresInvoicing,
  };
}

/** The ACK line the late-afternoon scenario adds to NGUYEN (decision 41). */
export function ackLine(c: Clock): NoteLine {
  return note(c.at(0, '09:14'), formatAckLine('9:14', 'JA'));
}
