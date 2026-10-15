/**
 * House vocabulary. Every list here is a decision the owner made (docs/owner-decisions.md).
 * Nothing on the wall uses a word that is not in this file.
 */

/** Jobber's own job status buckets. Decision 3: these are the only stage words on the wall. */
export const BUCKETS = [
  'unscheduled',
  'upcoming',
  'today',
  'late',
  'action_required',
  'requires_invoicing',
  'on_hold',
  'archived',
] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Display words for buckets, exactly as Jobber prints them. */
export const BUCKET_LABEL: Record<Bucket, string> = {
  unscheduled: 'UNSCHEDULED',
  upcoming: 'UPCOMING',
  today: 'TODAY',
  late: 'LATE',
  action_required: 'ACTION REQUIRED',
  requires_invoicing: 'REQUIRES INVOICING',
  on_hold: 'ON HOLD',
  archived: 'CLOSED',
};

/** Buckets that put a line on the NEEDS ATTENTION strip (decision 29). Order = display order. */
export const ATTENTION_BUCKETS = ['late', 'action_required', 'requires_invoicing'] as const;
export type AttentionBucket = (typeof ATTENTION_BUCKETS)[number];

/** Program classification. Blank or unknown title token = `PROGRAM` (fail-closed: treated as program work). */
export const PROGRAMS = ['CE_INSULATION', 'CE_HVAC', 'STANDARD', 'PROGRAM'] as const;
export type Program = (typeof PROGRAMS)[number];

/** Scope codes shown on cards: LASTNAME · CITY · SCOPE. */
export const SCOPES = ['ATT', 'WALL', 'AIR', 'BD', 'HVAC', 'EVAL', 'SVC', '—'] as const;
export type Scope = (typeof SCOPES)[number];

/** Jobber job-form "Visit result" values (decided 35 on Oct 3; decision 10). */
export const VISIT_RESULTS = [
  'Completed',
  'Return needed',
  'Prepped',
  'Not started',
  'Customer cancelled',
  'Problem',
] as const;
export type VisitResult = (typeof VISIT_RESULTS)[number];

/** Where a visit result came from, in precedence order. */
export const RESULT_SOURCES = ['jobForm', 'note', 'recapQueued', 'unknown'] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];

/** Office close codes written in the visit note at the 4 PM close (`CLOSE: <code>`). */
export const CLOSE_CODES = ['C', 'CM', 'PR', 'NW-R', 'NW-W', 'RS'] as const;
export type CloseCode = (typeof CLOSE_CODES)[number];

/** Why a visit did not end Completed. Crew lead picks one (decision 42). */
export const MISS_REASONS = [
  'ACCESS',
  'MATERIALS',
  'SCOPE CHANGED',
  'PRE-EXISTING',
  'EQUIPMENT/TRUCK',
  'WEATHER',
  'OVERCOMMITTED',
  'OTHER',
] as const;
export type MissReason = (typeof MISS_REASONS)[number];

/** Review verdicts in the Photo Review Queue sheet (decision 7). */
export const VERDICTS = ['READY', 'FIX', 'HOLD'] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Sheet Status column values, as they exist today. */
export const REVIEW_STATUSES = ['', 'Fixed', 'Accepted as is', 'Submitted'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Why a job cannot be invoiced (decision 30). Order here is NOT precedence; see derive/cannotInvoice.ts. */
export const REASONS = [
  'AWAITING 1ST REVIEW',
  'AWAITING 2ND REVIEW',
  'FIX OPEN',
  'HOLD',
  'RETURN NEEDED',
  'BLOWER DOOR FAIL',
  'FORM/QUANTITIES MISSING',
  'INSPECTION/PERMIT',
  'PROGRAM-WAIT',
  'READY TO INVOICE',
] as const;
export type Reason = (typeof REASONS)[number];

/** Per-stage clocks on a cannot-invoice line (decision 31). */
export const STAGES = ['completed', 'first_review', 'second_review', 'submitted', 'accepted'] as const;
export type Stage = (typeof STAGES)[number];

/** The 12-value FIX picklist for the sheet's "Fix before submitting" column. */
export const FIX_PICKLIST = [
  'No BEFORE shot / wrong angle',
  'No depth marker or ruler',
  'Hatch not shown',
  'Chimney dam not shown',
  'Junction boxes not flagged',
  'Chutes / baffles not shown',
  'Blower-door reading not photographed',
  'Certificate at panel not shown',
  'Form unsigned',
  'Quantities missing',
  'Undated / blurry',
  'Other (see notes)',
] as const;
export type FixPick = (typeof FIX_PICKLIST)[number];

/** Merged issue list for FLAG (decision 15) and how each maps onto the KPI Flags tab's Type / FlagType. */
export const ISSUE_TYPES = [
  'Improper Install',
  'Work Not Completed',
  'Professionalism',
  'Missing Photos or Paperwork',
  'CLEAResult Return',
  'Office pre-arrival pack missing',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_TO_FLAG: Record<IssueType, { type: 'Compliance' | 'Improper Install'; flagType: string }> = {
  'Improper Install': { type: 'Improper Install', flagType: '' },
  'Work Not Completed': { type: 'Compliance', flagType: 'Work Not Completed' },
  Professionalism: { type: 'Compliance', flagType: 'Professionalism' },
  'Missing Photos or Paperwork': { type: 'Compliance', flagType: 'Pictures' },
  'CLEAResult Return': { type: 'Compliance', flagType: 'CLEAResult Return' },
  'Office pre-arrival pack missing': { type: 'Compliance', flagType: 'Pre-arrival pack' },
};

/** Line owner roles when initials are not allowed (decision 33). */
export const OWNER_ROLES = ['CREW', 'OFFICE'] as const;
export type OwnerRole = (typeof OWNER_ROLES)[number];

/** Chip tones map onto the house palette (decision 27): red = act, blue = move, green = automatic, amber = exception. */
export type ChipTone = 'grey' | 'red' | 'blue' | 'green' | 'amber' | 'brand';

/** Every word a card chip can show. The six Visit results as Jobber spells them, plus the house words. */
export type ChipWord = VisitResult | 'NOT STARTED' | 'NOW' | 'LATE' | 'NO RESULT' | 'AWAITING REVIEW' | 'FIX' | 'HOLD' | 'READY' | 'DONE';

/** Card status chips: every chip is a word AND an icon (red never alone). Single source for icon and tone. */
export const CHIP: Record<ChipWord, { icon: string; tone: ChipTone }> = {
  Completed: { icon: '✓', tone: 'grey' },
  'Return needed': { icon: '↩', tone: 'blue' },
  Prepped: { icon: '◐', tone: 'grey' },
  'Not started': { icon: '○', tone: 'grey' },
  'Customer cancelled': { icon: '✕', tone: 'blue' },
  Problem: { icon: '⚠', tone: 'red' },
  'NOT STARTED': { icon: '○', tone: 'grey' },
  NOW: { icon: '●', tone: 'brand' },
  LATE: { icon: '⚠', tone: 'red' },
  'NO RESULT': { icon: '◌', tone: 'amber' },
  'AWAITING REVIEW': { icon: '◔', tone: 'grey' },
  FIX: { icon: '✎', tone: 'amber' },
  HOLD: { icon: '❚❚', tone: 'amber' },
  READY: { icon: '✓✓', tone: 'green' },
  DONE: { icon: '✓✓', tone: 'grey' },
};

/** Title tokens the parser accepts (any case), in the order they are tested. */
export const TITLE_TOKENS: Record<string, Program> = {
  STD: 'STANDARD',
  STANDARD: 'STANDARD',
  'CONSUMERS HVAC': 'CE_HVAC',
  'CE HVAC': 'CE_HVAC',
  CEHN: 'CE_INSULATION',
  CONSUMERS: 'CE_INSULATION',
  'CE INS': 'CE_INSULATION',
  HVAC: 'STANDARD',
  SERVICE: 'STANDARD',
  WARRANTY: 'STANDARD',
};
