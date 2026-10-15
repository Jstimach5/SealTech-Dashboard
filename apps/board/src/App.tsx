/**
 * Screen router by state, auto-return to TODAY, kiosk watchdog, tap records, the ACK-after-PIN flow.
 *
 * PIN sessions are short-lived: a session ends when the screen changes by any route (tab, ← TODAY,
 * auto-return), right after the ACK-after-PIN post, and after CONFIG.AUTO_RETURN_SEC without input
 * wherever the board is. A write answered 401 drops the session so the PIN gate comes back.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONFIG } from '@sealtech/domain';
import { BoardContext, type Board, type Screen } from './context';
import { api, postTap } from './data/api';
import { useNow } from './data/useNow';
import { useSnapshot } from './data/useSnapshot';
import { kioskMode, wallForced } from './lib/mode';
import type { Session } from './pin/usePin';
import { CannotInvoice } from './screens/CannotInvoice';
import { PinGate } from './screens/PinGate';
import { Review } from './screens/Review';
import { Scorecard } from './screens/Scorecard';
import { Stages } from './screens/Stages';
import { Today } from './screens/Today';
import { Footer } from './zones/Footer';
import { TopBar } from './zones/TopBar';

const WATCHDOG_MS = 5 * 60 * 1000;
const OFFICE_ROLES: ReadonlySet<string> = new Set(['office', 'owner']);

/** Revision G: the wall layout only where it fits (≥ 1900×1060 CSS px) or when forced with `?wall=1`. */
function wallFits(): boolean {
  return wallForced() || (window.innerWidth >= 1900 && window.innerHeight >= 1060);
}

/**
 * Layout by viewport: 'wall' (the fixed 1920×1080 page) or 'compact' (TODAY as a responsive list). The
 * PIN screens and lookups keep the fixed 1920×1080 page, scaled down (never up) on a smaller window.
 */
function useLayout(): 'wall' | 'compact' {
  const [layout, setLayout] = useState<'wall' | 'compact'>(() => (wallFits() ? 'wall' : 'compact'));
  useEffect(() => {
    const apply = () => {
      setLayout(wallFits() ? 'wall' : 'compact');
      const s = wallForced() ? 1 : Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080);
      document.documentElement.style.setProperty('--scale', String(Number.isFinite(s) && s > 0 ? s : 1));
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
  return layout;
}

/**
 * Anything that is not the plain TODAY screen (and any open PIN session, wherever it is) ends after
 * CONFIG.AUTO_RETURN_SEC s without a touch, click or key: back to TODAY, session and pending ACK cleared.
 */
function useAutoReturn(active: boolean, onReturn: () => void): void {
  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(onReturn, CONFIG.AUTO_RETURN_SEC * 1000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onReturn, CONFIG.AUTO_RETURN_SEC * 1000);
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown', 'click'];
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [active, onReturn]);
}

/** Kiosk only: reload when no snapshot poll has succeeded for five minutes. */
function useWatchdog(lastOkAt: number | undefined): void {
  useEffect(() => {
    if (!kioskMode()) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const last = lastOkAt ?? started;
      if (Date.now() - last > WATCHDOG_MS) window.location.reload();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [lastOkAt]);
}

export function App() {
  const { snapshot, lastFetchOk, lastOkAt, error, tick, refresh } = useSnapshot();
  const { now, displayNow, frozen } = useNow(snapshot);
  const [screen, setScreen] = useState<Screen>('today');
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [pendingAck, setPendingAck] = useState<string | undefined>(undefined);
  const [ackNotes, setAckNotes] = useState<Record<string, string>>({});
  const layout = useLayout();
  useWatchdog(lastOkAt);

  const go = useCallback(
    (next: Screen, target: string) => {
      postTap(screen, target);
      // Leaving a screen by any route ends the PIN session (REVIEW, SCORECARD, the OWNER pick).
      if (next !== screen) setSession(undefined);
      setScreen(next);
      setPendingAck(undefined);
    },
    [screen],
  );
  const onReturn = useCallback(() => {
    setScreen('today');
    setSession(undefined);
    setPendingAck(undefined);
  }, []);
  useAutoReturn(screen !== 'today' || pendingAck !== undefined || session !== undefined, onReturn);

  const sendAck = useCallback(
    async (visitId: string, token: string) => {
      const res = await api('/api/ack', { body: { visitId }, token });
      setAckNotes((n) => ({ ...n, [visitId]: res.ok ? 'queued' : res.error }));
      if (res.ok) refresh();
      if (!res.ok && res.status === 401) setSession(undefined);
    },
    [refresh],
  );

  const requestAck = useCallback(
    (visitId: string) => {
      postTap(screen, `ack:${visitId}`);
      setAckNotes((n) => {
        const { [visitId]: _old, ...rest } = n;
        return rest;
      });
      // Only an office or owner session may ACK (http-api.md); anyone else gets the PIN gate.
      if (session && OFFICE_ROLES.has(session.person.role)) void sendAck(visitId, session.token);
      else {
        setSession(undefined);
        setPendingAck(visitId);
      }
    },
    [screen, session, sendAck],
  );

  // A PIN entered for an ACK sends it at once, closes the gate and ends the session once the post lands.
  useEffect(() => {
    if (!pendingAck || !session) return;
    const visitId = pendingAck;
    const token = session.token;
    setPendingAck(undefined);
    void sendAck(visitId, token).finally(() => setSession(undefined));
  }, [pendingAck, session, sendAck]);

  const board = useMemo<Board | undefined>(
    () =>
      snapshot
        ? { snapshot, now, displayNow, frozen, screen, go, session, setSession, requestAck, ackNotes, refresh, lastFetchOk, error, tick }
        : undefined,
    [snapshot, now, displayNow, frozen, screen, go, session, requestAck, ackNotes, refresh, lastFetchOk, error, tick],
  );

  if (!board) {
    return (
      <div className="page" data-testid="loading">
        <div className="tier-c brand bold">SealTech board</div>
        <div className="tier-c muted">{error ? `waiting for a good snapshot · ${error}` : 'loading the snapshot…'}</div>
        <div />
      </div>
    );
  }

  let body: JSX.Element;
  if (pendingAck !== undefined && !session) body = <PinGate title="ACK" testId="screen-ack-pin" roles={OFFICE_ROLES} />;
  else {
    switch (screen) {
      case 'stages':
        body = <Stages />;
        break;
      case 'cannot-invoice':
        body = <CannotInvoice />;
        break;
      case 'review':
        body = session ? <Review session={session} /> : <PinGate title="REVIEW" testId="screen-review" />;
        break;
      case 'scorecard':
        body = session ? <Scorecard /> : <PinGate title="SCORECARD" testId="screen-scorecard" />;
        break;
      default:
        body = <Today layout={layout} />;
    }
  }

  const todayScreen = screen === 'today' && !(pendingAck !== undefined && !session);
  const compactToday = todayScreen && layout === 'compact';
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('layout-compact', compactToday);

  return (
    <BoardContext.Provider value={board}>
      {compactToday ? (
        body
      ) : todayScreen ? (
        <div className="page page--wall" data-screen={screen}>
          {body}
        </div>
      ) : (
        <div className="page" data-screen={screen}>
          <TopBar />
          {body}
          <Footer />
        </div>
      )}
    </BoardContext.Provider>
  );
}
