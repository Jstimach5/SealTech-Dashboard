/** Top bar: clock · FOCUS line (or the STALE banner) · screen tabs. The focus line is the one human-typed line on the wall and always shows whole. */
import { boardStale } from '@sealtech/domain';
import { SCREEN_TITLE, useBoard, type Screen } from '../context';
import { wallClock, wallTime } from '../lib/format';
import { FitText } from '../ui/FitText';
import { Tag } from '../ui/Tag';

const TABS: Screen[] = ['today', 'stages', 'cannot-invoice', 'review', 'scorecard'];

export function TopBar() {
  const { snapshot, now, displayNow, frozen, screen, go } = useBoard();
  const stale = boardStale(snapshot.sources, now);
  const staleHead = `⚠ DATA STALE · ${stale.minutesSince ?? '—'} min`;
  const staleTail = `last Jobber load ${stale.lastJobberOkAt ? wallTime(stale.lastJobberOkAt) : '—'}`;
  const focus = snapshot.focusLine.trim().toUpperCase();
  return (
    <header className="topbar zone" data-testid="topbar">
      <div className="topbar__clock tier-d bold" aria-label="clock" data-testid="clock">
        <span className="nowrap">{wallClock(displayNow)}</span>
        {frozen && <Tag text="fixtures" tone="muted" testId="fixtures-tag" lower />}
      </div>
      <div className="topbar__centre">
        {stale.stale ? (
          <div className="stale-banner" data-testid="stale-banner" role="alert">
            <FitText text={staleHead} max={34} min={24} className="bold stale-banner__head" />
            <span className="tier-d stale-banner__tail nowrap">{staleTail}</span>
          </div>
        ) : focus !== '' ? (
          <div className="focus-line" data-testid="focus-line" aria-label="focus line">
            <FitText text={focus} max={42} min={32} wrap className="bold caps brand focus-line__text" />
          </div>
        ) : null}
      </div>
      <nav className="topbar__tabs" aria-label="screens">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            className={`tab ${screen === s ? 'tab--active' : ''}`}
            data-testid={`tab-${s}`}
            aria-label={`${SCREEN_TITLE[s].replace(' 🔒', '')} screen`}
            aria-current={screen === s ? 'page' : undefined}
            onClick={() => go(s, `tab:${s}`)}
          >
            {SCREEN_TITLE[s]}
          </button>
        ))}
      </nav>
    </header>
  );
}
