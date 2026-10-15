/**
 * Writes the committed fixture snapshots:
 *   fixtures/snapshot.json                 — the default scenario (what `npm run demo` serves)
 *   fixtures/snapshots/<scenario>.json     — every scenario, for Playwright and the service's fixture mode
 *
 * Usage: npm run fixtures            (all scenarios, anchor clock)
 *        FIXTURE_NOW=2026-10-14T13:30:00Z FIXTURE_SCENARIO=stale npm run fixtures
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSnapshot, type Snapshot } from '@sealtech/domain';
import { SCENARIOS, scenarioInputs } from './scenarios.js';

const here = dirname(fileURLToPath(import.meta.url));

export function buildScenario(name: string, now?: string): Snapshot {
  return buildSnapshot(scenarioInputs(name, now));
}

function main(): void {
  const only = process.env.FIXTURE_SCENARIO;
  const now = process.env.FIXTURE_NOW || undefined;
  const names = only ? [only] : Object.keys(SCENARIOS);
  mkdirSync(join(here, 'snapshots'), { recursive: true });
  for (const name of names) {
    const snapshot = buildScenario(name, now);
    const json = JSON.stringify(snapshot, null, 2) + '\n';
    writeFileSync(join(here, 'snapshots', `${name}.json`), json);
    if (name === 'default') writeFileSync(join(here, 'snapshot.json'), json);
    const s = snapshot;
    console.log(
      `${name.padEnd(17)} ${s.boardDate} ${s.generatedAt}  hero ${s.hero.cannotInvoice}  rail ${s.cannotInvoice.length}  attention ${s.attention.length}  visits ${s.visits.length}  rows ${s.reviewRows.length} (unmatched ${s.unmatchedReviewRows})`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
