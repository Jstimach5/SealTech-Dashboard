/**
 * A source produces everything `buildSnapshot` needs EXCEPT what the service itself owns: the clock,
 * the mode and build stamp, the focus line and responder (settings), the queued writes and recaps
 * (the `queued_writes` table), and the huddle owner overrides (the `owner_overrides` table).
 * Fixtures and live Jobber produce the same shape; the builder merges the service state on top.
 */
import type { Instant, SourceInputs } from '@sealtech/domain';

export type ServiceOwnedKey = 'focusLine' | 'responderInitials' | 'queuedWrites' | 'queuedRecaps' | 'ownerOverrides' | 'build' | 'mode' | 'now';

/**
 * Starting values a source may suggest for the service-owned fields (a fixture scenario ships a focus
 * line, a responder, a seeded queued recap). The service's own state always wins: a setting replaces
 * the default outright, a DB write for a visit replaces the seeded one for that visit.
 */
export type SourceDefaults = Partial<Pick<SourceInputs, 'focusLine' | 'responderInitials' | 'queuedWrites' | 'queuedRecaps' | 'ownerOverrides'>>;

export type RawInputs = Omit<SourceInputs, ServiceOwnedKey> & { defaults?: SourceDefaults };

export interface Source {
  readonly name: 'fixtures' | 'live';
  load(now: Instant): Promise<RawInputs>;
}
