/**
 * Live source: Jobber GraphQL + the two Google Sheets. Milestone M8 fills this in once the developer
 * app exists (docs/jobber-app-handoff.md answers the assumptions in docs/jobber-assumptions.md).
 * Until then every load fails the same way, which the poll loop reports as `sources.jobber.ok=false`.
 */
import type { RawInputs, Source } from './types.js';

export function liveSource(): Source {
  return {
    name: 'live',
    async load(): Promise<RawInputs> {
      throw new Error('live source needs the Jobber developer app (docs/jobber-app-handoff.md); set BOARD_DATA_SOURCE=fixtures');
    },
  };
}
