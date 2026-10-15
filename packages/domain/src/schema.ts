import { z } from 'zod';
import {
  BUCKETS,
  PROGRAMS,
  SCOPES,
  VISIT_RESULTS,
  RESULT_SOURCES,
  CLOSE_CODES,
  MISS_REASONS,
  VERDICTS,
  REVIEW_STATUSES,
  REASONS,
  STAGES,
  OWNER_ROLES,
  ATTENTION_BUCKETS,
} from './enums.js';

const instant = z.string().min(1);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const OwnerSchema = z.union([z.object({ initials: z.string().min(1).max(3) }), z.object({ role: z.enum(OWNER_ROLES) })]);

export const PersonPublicSchema = z.object({
  jobberUserId: z.string(),
  lastName: z.string(),
  initials: z.string(),
  role: z.enum(['owner', 'office', 'crewLead', 'crew']),
  reviewPass: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

export const CrewSchema = z.object({
  leadUserId: z.string(),
  leadLastName: z.string(),
  initials: z.string(),
  memberUserIds: z.array(z.string()),
});

export const JobSchema = z
  .object({
    id: z.string(),
    jobNumber: z.number().int(),
    title: z.string(),
    lastName: z.string(),
    city: z.string(),
    scope: z.enum(SCOPES),
    program: z.enum(PROGRAMS),
    bucket: z.enum(BUCKETS),
    bucketSince: instant,
    bucketSinceSource: z.enum(['observed', 'updatedAt']),
    completedAt: instant.optional(),
    updatedAt: instant,
    companyCamUrl: z.string().optional(),
    permitStatus: z.string().optional(),
    invoiced: z.boolean(),
    isZeroTotal: z.boolean(),
    hasUninvoicedWork: z.boolean(),
    remindersOff: z.boolean().optional(),
    futureVisitCount: z.number().int().nonnegative(),
    visitIds: z.array(z.string()),
    noteLines: z.array(z.object({ at: instant, text: z.string() })),
  })
  .strict();

export const VisitSchema = z
  .object({
    id: z.string(),
    jobId: z.string(),
    startAt: instant,
    endAt: instant,
    createdAt: instant,
    completedAt: instant.optional(),
    isComplete: z.boolean(),
    isLastScheduledVisit: z.boolean(),
    incompleteJobFormsCount: z.number().int().nonnegative(),
    formsSeenMax: z.number().int().nonnegative(),
    assignedUserIds: z.array(z.string()),
    instructions: z.string().optional(),
    plannedAsPrep: z.boolean(),
    result: z.enum(VISIT_RESULTS).optional(),
    resultSource: z.enum(RESULT_SOURCES),
    resultAt: instant.optional(),
    missReason: z.enum(MISS_REASONS).optional(),
    closeCode: z.enum(CLOSE_CODES).optional(),
    ack: z.object({ at: instant, initials: z.string() }).optional(),
  })
  .strict();

export const ReviewRowSchema = z
  .object({
    rowIndex: z.number().int(),
    checked: z.string(),
    application: z.string(),
    installDate: z.string(),
    tech: z.string(),
    jobDesc: z.string(),
    verdict: z.enum(VERDICTS).optional(),
    fixBeforeSubmitting: z.string().optional(),
    holdReason: z.string().optional(),
    reviewNotes: z.string().optional(),
    blowerDoorPrePost: z.string().optional(),
    status: z.enum(REVIEW_STATUSES).optional(),
    ownerNotes: z.string().optional(),
    jobberJobId: z.string().optional(),
    jobNumber: z.number().int().optional(),
    pass: z.union([z.literal(1), z.literal(2)]).optional(),
    reviewerUserId: z.string().optional(),
    reviewedAt: instant.optional(),
    submittedDate: localDate.optional(),
    acceptedDate: localDate.optional(),
    returnedDate: localDate.optional(),
    returnedReason: z.string().optional(),
    submissionId: z.string().optional(),
    match: z.enum(['exact', 'inferred', 'none']),
    matchedJobId: z.string().optional(),
  })
  .strict();

export const AttentionLineSchema = z.object({
  kind: z.enum(ATTENTION_BUCKETS),
  jobId: z.string(),
  label: z.string(),
  sinceAt: instant,
  sinceSource: z.enum(['observed', 'updatedAt']),
  ageDays: z.number().int().nonnegative(),
  owner: OwnerSchema,
});

export const CannotInvoiceLineSchema = z.object({
  jobId: z.string(),
  label: z.string(),
  reason: z.enum(REASONS),
  fixPick: z.string().optional(),
  owner: OwnerSchema,
  clocks: z.record(z.enum(STAGES), instant),
  openStage: z.enum(STAGES),
  stageDays: z.number().int().nonnegative(),
  daysSinceCompleted: z.number().int().nonnegative(),
  colour: z.enum(['none', 'amber', 'red', 'grey']),
  hardRed: z.boolean(),
  tags: z.array(z.enum(['NO-REMINDER', 'NO CHARGE?'])),
  needBy: localDate.optional(),
});

export const SourceStatusSchema = z.object({
  connected: z.boolean(),
  ok: z.boolean(),
  lastOkAt: instant.optional(),
  lastAttemptAt: instant.optional(),
  error: z.string().optional(),
});

export const QueuedWriteSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  kind: z.enum(['visit_note', 'ack', 'review_row', 'flag_row']),
  targetId: z.string(),
  status: z.enum(['queued', 'sent', 'failed']),
  createdAt: instant,
  createdBy: z.string(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
});

export const ScorecardRowSchema = z.object({
  weekStart: localDate,
  planKeptPct: z.number().nullable(),
  answeredPct: z.number().nullable(),
  firstPassReadyPct: z.number().nullable(),
  photoCompletePct: z.number().nullable(),
  cannotInvoiceCount: z.number().nullable(),
  cannotInvoiceOldestDays: z.number().nullable(),
  daysToSubmitMedian: z.number().nullable(),
  daysToSubmitP90: z.number().nullable(),
  firstTimeAcceptancePct: z.number().nullable(),
  perCrewFirstPass: z.record(z.object({ ready: z.number(), total: z.number() })).optional(),
});

const countsShape = Object.fromEntries(BUCKETS.filter((b) => b !== 'archived').map((b) => [b, z.number().int().nonnegative()])) as Record<
  Exclude<(typeof BUCKETS)[number], 'archived'>,
  z.ZodNumber
>;

export const SnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: instant,
    boardDate: localDate,
    build: z.string(),
    mode: z.enum(['fixtures', 'live']),
    focusLine: z.string().max(30),
    responderInitials: z.string().optional(),
    boardOwnerInitials: z.string(),
    sources: z.object({ jobber: SourceStatusSchema, reviewSheet: SourceStatusSchema, flagsSheet: SourceStatusSchema, companyCam: SourceStatusSchema }),
    people: z.array(PersonPublicSchema),
    crews: z.array(CrewSchema),
    jobs: z.array(JobSchema),
    visits: z.array(VisitSchema),
    reviewRows: z.array(ReviewRowSchema),
    attention: z.array(AttentionLineSchema),
    cannotInvoice: z.array(CannotInvoiceLineSchema),
    hero: z.object({
      cannotInvoice: z.number().int().nonnegative(),
      visitsNotReady: z.number().int().nonnegative(),
      oldestDays: z.number().int().nonnegative(),
      medianDays: z.number().nonnegative(),
      byReason: z.record(z.enum(REASONS), z.number().int()),
      reviewQueue: z.object({ pass1: z.number().int(), pass2: z.number().int(), fix: z.number().int(), hold: z.number().int() }),
    }),
    scoreline: z.object({
      kept: z.number().int(),
      planned: z.number().int(),
      unknown: z.number().int(),
      misses: z.record(z.enum(MISS_REASONS), z.number().int()),
      firstPassReady: z.object({ ready: z.number().int(), total: z.number().int() }).nullable(),
      day: z.string().optional(),
      firstPassWeek: z.enum(['this', 'last']).optional(),
    }),
    counts: z.object({ ...countsShape, unanswered: z.number().int().nonnegative() }),
    unansweredUnknown: z.number().int().nonnegative(),
    unmatchedReviewRows: z.number().int().nonnegative(),
    packagesOpen: z.number().int().nonnegative(),
    queuedWrites: z.array(QueuedWriteSchema),
    cardMeta: z.record(z.object({ photosCount: z.number().int().optional(), lastCaptureAt: instant.optional(), synced: z.enum(['jobber', 'queued', 'none']) })),
    scorecard: z.array(ScorecardRowSchema),
  })
  .strict();

export type SnapshotParsed = z.infer<typeof SnapshotSchema>;

/** Rejects anything that looks like money, a street address or a phone number anywhere in the snapshot (decision 4). */
export function assertNoPrivateText(snapshot: unknown): string[] {
  const offenders: string[] = [];
  const money = /\$\s?\d/;
  const phone = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
  // Any case: Jobber and the sheets carry addresses in capitals as often as not (`2635 NEEDHAM ST`).
  const street = /\b\d{2,6}\s+[A-Za-z]+(\s+[A-Za-z]+){0,2}\s+(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Ct|Court|Way|Pl|Place|Trail|Pass|Hwy|Highway)\b\.?/i;
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      if (money.test(v) || phone.test(v) || street.test(v)) offenders.push(`${path}: ${v.slice(0, 40)}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(snapshot, '$');
  return offenders;
}
