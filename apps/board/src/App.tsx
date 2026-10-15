/** Screen router by state, auto-return to TODAY, kiosk watchdog, tap records, the ACK-after-PIN flow. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONFIG } from '@sealtech/domain';
import { BoardContext, type Board, type Screen } from './context';
import { api, postTap } from './data/api';
import { useNow } from './data/useNow';
import { useSnapshot } from './data/useSnapshot';
import { kioskMode } from './lib/mode';
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

/** Scale the 1920×1080 page down to the window (never up): no scroll, ever. */
function useViewportScale(): void {
  useEffect(() => {
    const apply = () => {
      const s = Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080);
      document.documentElement.style.setProperty('--scale', String(Number.isFinite(s) && s > 0 ? s : 1));
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
}

/** Anything that is not the plain TODAY screen returns to it after CONFIG.AUTO_RETURN_SEC s without a touch, click or key. */
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
  useViewportScale();
  useWatchdog(lastOkAt);

  const go = useCallback(
    (next: Screen, target: string) => {
      postTap(screen, target);
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
  useAutoReturn(screen !== 'today' || pendingAck !== undefined, onReturn);

  const sendAck = useCallback(
    async (visitId: string, token: string) => {
      const res = await api('/api/ack', { body: { visitId }, token });
      setAckNotes((n) => ({ ...n, [visitId]: res.ok ? 'queued' : res.error }));
      if (res.ok) refresh();
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
      if (session) void sendAck(visitId, session.token);
      else setPendingAck(visitId);
    },
    [screen, session, sendAck],
  );

  // A PIN entered for an ACK sends it at once and closes the gate.
  useEffect(() => {
    if (!pendingAck || !session) return;
    const visitId = pendingAck;
    setPendingAck(undefined);
    void sendAck(visitId, session.token);
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
  if (pendingAck !== undefined && !session) body = <PinGate title="ACK" testId="screen-ack-pin" />;
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
        body = <Today />;
    }
  }

  return (
    <BoardContext.Provider value={board}>
      <div className="page" data-screen={screen}>
        <TopBar />
        {body}
        <Footer />
      </div>
    </BoardContext.Provider>
  );
}
