/**
 * Fixture source: the TESTVILLE dataset through a scenario overlay (decision 24, 47).
 *
 * Two clock modes, both driven by the `now` the service passes in:
 *   - FIXTURE_NOW set: the service passes that frozen instant; the dataset renders the anchor day
 *     exactly as the committed `fixtures/snapshots/<scenario>.json` (deterministic screenshots).
 *   - FIXTURE_NOW unset: the service passes the real clock. The dataset is built RELATIVE to `now`
 *     (every visit, note and sheet date is an offset from the board date), so the board shows today's
 *     date with the scenario's time-of-day semantics shifted to whatever time it is now: at 07:00 the
 *     lanes read NOT STARTED, by mid-morning NGUYEN's 09:05 Problem has fired, and so on.
 */
import { scenarioInputs } from '@sealtech/fixtures/scenarios.js';
import type { RawInputs, Source } from './types.js';

export function fixtureSource(scenario: string): Source {
  return {
    name: 'fixtures',
    async load(now): Promise<RawInputs> {
      const s = scenarioInputs(scenario, now);
      const { focusLine, responderInitials, queuedWrites, queuedRecaps, ownerOverrides, build: _build, mode: _mode, now: _now, ...raw } = s;
      return {
        ...raw,
        defaults: {
          focusLine,
          ...(responderInitials !== undefined ? { responderInitials } : {}),
          queuedWrites,
          queuedRecaps,
          ownerOverrides,
        },
      };
    },
  };
}
