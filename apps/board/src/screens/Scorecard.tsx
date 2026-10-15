/** SCORECARD (decisions 39, 44, 45): weekly numbers, no targets during the baseline, crew-level first-pass only here. */
import { useBoard } from '../context';
import { dayMonthOfLocalDate, num, pct } from '../lib/format';
import { Button } from '../ui/Button';

const MAX_WEEKS = 13;

interface Column {
  key: string;
  head: string;
  role: string;
}

const COLUMNS: Column[] = [
  { key: 'week', head: 'week', role: '' },
  { key: 'planKept', head: 'plan kept', role: 'office' },
  { key: 'answered', head: 'answered', role: 'crew lead' },
  { key: 'firstPass', head: 'first-pass READY', role: 'crew lead' },
  { key: 'photo', head: 'photo complete', role: 'crew lead' },
  { key: 'cannot', head: 'cannot invoice', role: 'office' },
  { key: 'oldest', head: 'oldest d', role: 'office' },
  { key: 'median', head: 'days→submit median', role: 'office' },
  { key: 'p90', head: 'P90', role: 'office' },
  { key: 'acceptance', head: 'first-time acceptance', role: 'owner' },
];

export function Scorecard() {
  const { snapshot, go, setSession } = useBoard();
  const rows = snapshot.scorecard.slice(-MAX_WEEKS);
  const latest = [...rows].reverse().find((r) => r.perCrewFirstPass && Object.keys(r.perCrewFirstPass).length > 0);
  return (
    <main className="screen scorecard" data-testid="screen-scorecard">
      <div className="screen__bar">
        <span className="tier-c bold brand">Weekly scorecard</span>
        <span className="tier-d muted">baseline weeks · numbers only</span>
        <span className="screen__bar-spacer" />
        <Button label="lock the screen" small tone="quiet" onClick={() => setSession(undefined)}>
          lock 🔒
        </Button>
        <Button label="back to today" small tone="quiet" onClick={() => go('today', 'scorecard:back')}>
          ← TODAY
        </Button>
      </div>
      <table className="scorecard__table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col">
                <span className="tier-d caps bold muted">{c.head}</span>
                {c.role && <span className="tier-d muted scorecard__role">({c.role})</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekStart} data-testid={`scorecard-row-${r.weekStart}`}>
              <td className="tier-c bold">{dayMonthOfLocalDate(r.weekStart)}</td>
              <td className="tier-c">{pct(r.planKeptPct)}</td>
              <td className="tier-c">{pct(r.answeredPct)}</td>
              <td className="tier-c">{pct(r.firstPassReadyPct)}</td>
              <td className="tier-c">{pct(r.photoCompletePct)}</td>
              <td className="tier-c">{num(r.cannotInvoiceCount)}</td>
              <td className="tier-c">{num(r.cannotInvoiceOldestDays)}</td>
              <td className="tier-c">{num(r.daysToSubmitMedian)}</td>
              <td className="tier-c">{num(r.daysToSubmitP90)}</td>
              <td className="tier-c">{pct(r.firstTimeAcceptancePct)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="tier-c muted">
                no weeks yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {latest?.perCrewFirstPass && (
        <section className="scorecard__crews" data-testid="scorecard-crews" aria-label="first-pass READY by crew">
          <span className="tier-d caps bold muted">First-pass READY by crew · week of {dayMonthOfLocalDate(latest.weekStart)}</span>
          <div className="scorecard__crew-row">
            {Object.entries(latest.perCrewFirstPass).map(([crew, v]) => (
              <span key={crew} className="scorecard__crew">
                <span className="tier-d caps bold muted">{crew}</span>
                <span className="tier-c bold">
                  {v.ready} of {v.total}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
