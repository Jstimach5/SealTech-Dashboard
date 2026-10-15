/** Tunables. Every number here is an owner decision; change the doc before the value. */
export const CONFIG = {
  /** Cannot-invoice line turns amber at this many days in the current SealTech-owned stage (decision 31). */
  AMBER_DAYS: 3,
  /** ... and red at this many days. */
  RED_DAYS: 7,
  /** Hard red when this many days since completion with no Vault submission. Provisional (decision 31). */
  HARD_RED_DAYS: 20,
  /**
   * Grace after a visit's scheduled end: the card stays NOW and the visit is not yet counted as
   * unanswered. After it, an open visit reads STILL OPEN and a complete one with no answer counts as unanswered.
   */
  NO_RESULT_GRACE_MIN: 30,
  /** A Problem without an acknowledgement for this many minutes gets the red border (decision 41). */
  ACK_MIN: 15,
  /** Footer dot amber after this many minutes since the last successful load. */
  STALE_AMBER_MIN: 10,
  /** Full-width STALE banner after this many minutes. */
  STALE_RED_MIN: 30,
  /** Open unsubmitted packages cap shown on STAGES (v5 WIP cap). */
  WIP_CAP: 15,
  /** Blower-door reduction below this fraction is a fail (20.0 %). */
  BLOWER_DOOR_MIN_REDUCTION: 0.2,
  /** Completed-visit date tolerance when inferring a review-row match, in days. */
  REVIEW_MATCH_TOLERANCE_DAYS: 3,
  /** Two identical review taps inside this window are one tap. */
  REVIEW_DEDUPE_MIN: 2,
  /** Non-TODAY screens return to TODAY after this many seconds idle. */
  AUTO_RETURN_SEC: 60,
  /** The board re-renders from the snapshot on this tick. */
  RENDER_TICK_SEC: 15,
  /** Lanes flip their last row to TOMORROW at this local hour. */
  TOMORROW_FLIP_HOUR: 15,
  /** First-pass verdict cut-off (Henry) and second-pass (Jack), local HH:MM (decision 40). */
  VERDICT_CUTOFF_PASS1: '16:30',
  VERDICT_CUTOFF_PASS2: '17:00',
  /** Weekly scorecard shows no targets until this many baseline weeks have elapsed (decision 45). */
  BASELINE_WEEKS: 4,
  /** Max visible rows per zone on the default screen. */
  MAX_ATTENTION_ROWS: 4,
  MAX_RAIL_ROWS: 3,
  MAX_LANES: 4,
  MAX_NEXT_ROWS: 2,
  /** America/Detroit. All day boundaries are computed in this zone. */
  TZ: 'America/Detroit',
} as const;

export type Config = typeof CONFIG;
