import type {
  Bucket,
  Program,
  Scope,
  VisitResult,
  ResultSource,
  CloseCode,
  MissReason,
  Verdict,
  ReviewStatus,
  Reason,
  Stage,
  OwnerRole,
  AttentionBucket,
  FixPick,
  IssueType,
} from './enums.js';

/** Jobber encoded id (base64 GID). Fixture ids carry a `-test-` marker and are refused by live writers. */
export type JobberId = string;
/** ISO-8601 instant with offset or Z. */
export type Instant = string;
/** YYYY-MM-DD in America/Detroit. */
export type LocalDate = string;

export type Owner = { initials: string } | { role: OwnerRole };

export interface Person {
  jobberUserId: JobberId;
  lastName: string;
  initials: string;
  role: 'owner' | 'office' | 'crewLead' | 'crew';
  /** 0 = cannot review, 1 = first pass (Henry), 2 = second pass (Jack). Decision 5. */
  reviewPass: 0 | 1 | 2;
  /** sha256 of `${jobberUserId}:${pin}`. Never the pin. */
  pinHash?: string;
}

export interface Crew {
  leadUserId: JobberId;
  leadLastName: string;
  initials: string;
  memberUserIds: JobberId[];
}

export interface NoteLine {
  at: Instant;
  text: string;
}

/** A Jobber job reduced to what the board may know. Never $, address or phone (decision 4). */
export interface Job {
  id: JobberId;
  jobNumber: number;
  title: string;
  lastName: string;
  city: string;
  scope: Scope;
  program: Program;
  bucket: Bucket;
  /** First instant this bucket was observed, or `updatedAt` when unobserved (then `bucketSinceSource` = 'updatedAt'). */
  bucketSince: Instant;
  bucketSinceSource: 'observed' | 'updatedAt';
  completedAt?: Instant;
  updatedAt: Instant;
  companyCamUrl?: string;
  permitStatus?: string;
  invoiced: boolean;
  isZeroTotal: boolean;
  hasUninvoicedWork: boolean;
  remindersOff?: boolean;
  futureVisitCount: number;
  visitIds: JobberId[];
  noteLines: NoteLine[];
}

export interface Visit {
  id: JobberId;
  jobId: JobberId;
  startAt: Instant;
  endAt: Instant;
  createdAt: Instant;
  completedAt?: Instant;
  isComplete: boolean;
  isLastScheduledVisit: boolean;
  /** Jobber's count of unanswered job forms. 0 on a visit that never had a form attached, so see `formsSeenMax`. */
  incompleteJobFormsCount: number;
  /** Highest `incompleteJobFormsCount` ever observed for this visit (service-kept). 0 = never had a form. */
  formsSeenMax: number;
  assignedUserIds: JobberId[];
  instructions?: string;
  /** True when this visit was scheduled as a prep day (decision 46). Derived; stored so the UI need not recompute. */
  plannedAsPrep: boolean;
  result?: VisitResult;
  resultSource: ResultSource;
  resultAt?: Instant;
  missReason?: MissReason;
  closeCode?: CloseCode;
  ack?: { at: Instant; initials: string };
}

/** One row of the Photo Review Queue sheet (tab `Queue`). Columns A–L exist today; M+ are appended by header name. */
export interface ReviewRow {
  rowIndex: number;
  checked: string;
  application: string;
  installDate: string;
  tech: string;
  /** Column E "Job": scope text today, NOT a job number. */
  jobDesc: string;
  verdict?: Verdict;
  fixBeforeSubmitting?: string;
  holdReason?: string;
  reviewNotes?: string;
  blowerDoorPrePost?: string;
  status?: ReviewStatus;
  ownerNotes?: string;
  // Appended columns (decision 30, 8).
  jobberJobId?: JobberId;
  jobNumber?: number;
  pass?: 1 | 2;
  reviewerUserId?: JobberId;
  reviewedAt?: Instant;
  submittedDate?: LocalDate;
  acceptedDate?: LocalDate;
  returnedDate?: LocalDate;
  returnedReason?: string;
  submissionId?: string;
  /** How this row was tied to a Jobber job. `none` rows appear in REVIEW's unmatched panel and never yield a verdict. */
  match: 'exact' | 'inferred' | 'none';
  /** Set by the matcher when `match !== 'none'`. */
  matchedJobId?: JobberId;
}

/** One row of the KPI Master `Flags` tab. Never placed in a snapshot (decision 16). */
export interface FlagRow {
  date: LocalDate;
  employee: string;
  type: 'Compliance' | 'Improper Install';
  rr: 'Y' | 'N';
  flagType: string;
  jobNumber: number;
  notes: string;
  crewOnReport: string;
}

export interface AttentionLine {
  kind: AttentionBucket;
  jobId: JobberId;
  /** `LASTNAME · CITY · SCOPE` */
  label: string;
  sinceAt: Instant;
  sinceSource: 'observed' | 'updatedAt';
  ageDays: number;
  owner: Owner;
}

export interface CannotInvoiceLine {
  jobId: JobberId;
  label: string;
  reason: Reason;
  /** Sub-reason when reason is FIX OPEN. */
  fixPick?: FixPick | string;
  owner: Owner;
  clocks: Partial<Record<Stage, Instant>>;
  openStage: Stage;
  stageDays: number;
  daysSinceCompleted: number;
  colour: 'none' | 'amber' | 'red' | 'grey';
  hardRed: boolean;
  tags: Array<'NO-REMINDER' | 'NO CHARGE?'>;
  needBy?: LocalDate;
}

export interface SourceStatus {
  connected: boolean;
  ok: boolean;
  lastOkAt?: Instant;
  lastAttemptAt?: Instant;
  error?: string;
}

export type SourceName = 'jobber' | 'reviewSheet' | 'flagsSheet' | 'companyCam';

export interface QueuedWrite {
  id: string;
  submissionId: string;
  kind: 'visit_note' | 'ack' | 'review_row' | 'flag_row';
  targetId: string;
  status: 'queued' | 'sent' | 'failed';
  createdAt: Instant;
  createdBy: string;
  attempts: number;
  lastError?: string;
}

export interface Hero {
  /** Jobber's own Requires Invoicing count, unmodified (decision 32). */
  cannotInvoice: number;
  visitsNotReady: number;
  oldestDays: number;
  medianDays: number;
  byReason: Partial<Record<Reason, number>>;
  reviewQueue: { pass1: number; pass2: number; fix: number; hold: number };
}

export interface Scoreline {
  kept: number;
  planned: number;
  unknown: number;
  misses: Partial<Record<MissReason, number>>;
  /** Company-level only on the wall (decision 35, 44). null → dash. */
  firstPassReady: { ready: number; total: number } | null;
}

export type Counts = Record<Exclude<Bucket, 'archived'>, number> & { unanswered: number };

export interface CardMeta {
  photosCount?: number;
  lastCaptureAt?: Instant;
  synced: 'jobber' | 'queued' | 'none';
}

export interface Snapshot {
  schemaVersion: 1;
  generatedAt: Instant;
  boardDate: LocalDate;
  build: string;
  mode: 'fixtures' | 'live';
  focusLine: string;
  responderInitials?: string;
  boardOwnerInitials: string;
  sources: Record<SourceName, SourceStatus>;
  people: Array<Pick<Person, 'jobberUserId' | 'lastName' | 'initials' | 'role' | 'reviewPass'>>;
  crews: Crew[];
  jobs: Job[];
  visits: Visit[];
  reviewRows: ReviewRow[];
  attention: AttentionLine[];
  cannotInvoice: CannotInvoiceLine[];
  hero: Hero;
  scoreline: Scoreline;
  counts: Counts;
  unansweredUnknown: number;
  unmatchedReviewRows: number;
  packagesOpen: number;
  queuedWrites: QueuedWrite[];
  cardMeta: Record<JobberId, CardMeta>;
  /** Weekly scorecard rows, oldest week first; null cells mean "feed does not exist". */
  scorecard: ScorecardRow[];
}

export interface ScorecardRow {
  weekStart: LocalDate;
  planKeptPct: number | null;
  answeredPct: number | null;
  firstPassReadyPct: number | null;
  photoCompletePct: number | null;
  cannotInvoiceCount: number | null;
  cannotInvoiceOldestDays: number | null;
  daysToSubmitMedian: number | null;
  daysToSubmitP90: number | null;
  firstTimeAcceptancePct: number | null;
  perCrewFirstPass?: Record<string, { ready: number; total: number }>;
}

/** Everything the service hands to `buildSnapshot`. Fixtures and live produce the same shape. */
export interface SourceInputs {
  now: Instant;
  mode: 'fixtures' | 'live';
  build: string;
  focusLine: string;
  responderInitials?: string;
  boardOwnerInitials: string;
  people: Person[];
  crews: Crew[];
  jobs: Job[];
  /** Visits for yesterday, today and tomorrow (local), result fields unresolved. */
  visits: Visit[];
  reviewRows: ReviewRow[];
  /** Job-form answers when the developer app exposes them: visitId → result. */
  formAnswers: Record<JobberId, { result: VisitResult; at: Instant; missReason?: MissReason }>;
  /** Queued crew recaps not yet in Jobber: visitId → recap. */
  queuedRecaps: Record<JobberId, { result: VisitResult; at: Instant; missReason?: MissReason; note?: string }>;
  /** Huddle owner overrides: jobId → initials, with the date they were set. */
  ownerOverrides: Record<JobberId, { initials: string; setOn: LocalDate }>;
  sources: Record<SourceName, SourceStatus>;
  queuedWrites: QueuedWrite[];
  cardMeta: Record<JobberId, CardMeta>;
  scorecard: ScorecardRow[];
  /** Jobber's own count for the requires_invoicing bucket (the hero number, decision 32). */
  jobberRequiresInvoicingCount: number;
}

export type IssueFlagInput = { issue: IssueType; jobNumber: number; employee: string; crewOnReport: string; notes: string; rr: 'Y' | 'N' };
