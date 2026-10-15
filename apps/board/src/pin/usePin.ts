/**
 * PIN identity (decision 20): name tiles from /api/people (or the snapshot's people when the
 * service is not there), a 4-digit PIN checked by /api/pin, a bearer token for the writes.
 * In the demo build (no service at all) PIN 1234 opens a clearly labelled demo session so the
 * laptop walk-through can show the screens; every write still fails with "needs the service".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '@sealtech/domain';
import { api, NEEDS_SERVICE } from '../data/api';
import { DEMO_BUILD } from '../lib/mode';

export type PinPerson = Snapshot['people'][number];

export interface Session {
  token: string;
  person: PinPerson;
  demo: boolean;
}

export interface PinState {
  people: PinPerson[];
  peopleError: string | undefined;
  busy: boolean;
  error: string | undefined;
  attemptsLeft: number | undefined;
  lockedForSec: number;
  lockedAt: number;
  demoFallback: boolean;
  submit: (userId: string, pin: string) => Promise<void>;
}

const PIN_ROLES: ReadonlySet<PinPerson['role']> = new Set(['office', 'owner', 'crewLead']);
const DEMO_PIN = '1234';

export function usePin(snapshot: Snapshot, onSession: (s: Session) => void, roles: ReadonlySet<string> = PIN_ROLES): PinState {
  const [people, setPeople] = useState<PinPerson[]>([]);
  const [peopleError, setPeopleError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attemptsLeft, setAttemptsLeft] = useState<number | undefined>(undefined);
  const [lockedForSec, setLockedForSec] = useState(0);
  const [lockedAt, setLockedAt] = useState(0);
  const [demoFallback, setDemoFallback] = useState(false);
  const alive = useRef(true);
  const unlockTimer = useRef<number | undefined>(undefined);

  // The lockout message lasts exactly as long as the service's 423 window.
  useEffect(
    () => () => {
      if (unlockTimer.current !== undefined) window.clearTimeout(unlockTimer.current);
    },
    [],
  );

  useEffect(() => {
    alive.current = true;
    const allowed = (p: PinPerson) => PIN_ROLES.has(p.role) && roles.has(p.role);
    const fromSnapshot = snapshot.people.filter(allowed);
    void (async () => {
      const res = await api<{ ok: true; people: PinPerson[] }>('/api/people');
      if (!alive.current) return;
      if (res.ok && Array.isArray(res.data.people)) {
        setPeople(res.data.people.filter(allowed));
        setPeopleError(undefined);
      } else {
        setPeople(fromSnapshot);
        setPeopleError(res.ok ? undefined : res.error);
        setDemoFallback(DEMO_BUILD);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [snapshot.people, roles]);

  const submit = useCallback(
    async (userId: string, pin: string) => {
      setBusy(true);
      setError(undefined);
      const res = await api<{ ok: true; token: string; person: PinPerson }>('/api/pin', { body: { userId, pin } });
      if (!alive.current) return;
      setBusy(false);
      if (res.ok) {
        setAttemptsLeft(undefined);
        onSession({ token: res.data.token, person: res.data.person, demo: false });
        return;
      }
      if (res.status === 423) {
        const sec = typeof res.body?.lockedForSec === 'number' ? res.body.lockedForSec : 60;
        setLockedForSec(sec);
        setLockedAt(Date.now());
        setError(res.error);
        // The service resets the failure count after a lock: no stale "N left" once it ends.
        setAttemptsLeft(undefined);
        if (unlockTimer.current !== undefined) window.clearTimeout(unlockTimer.current);
        unlockTimer.current = window.setTimeout(() => {
          unlockTimer.current = undefined;
          if (!alive.current) return;
          setError(undefined);
          setLockedForSec(0);
        }, sec * 1000);
        return;
      }
      if (res.status === 401) {
        setAttemptsLeft(typeof res.body?.attemptsLeft === 'number' ? res.body.attemptsLeft : undefined);
        setError(res.error);
        return;
      }
      // No service (demo build): a labelled demo session on the fixture PIN, else the sentence.
      if (DEMO_BUILD && (res.status === 0 || res.status === 503 || res.error === NEEDS_SERVICE)) {
        const person = people.find((p) => p.jobberUserId === userId);
        if (person && pin === DEMO_PIN) {
          onSession({ token: 'demo', person, demo: true });
          return;
        }
        setError(person ? 'wrong PIN (demo PIN is 1234)' : NEEDS_SERVICE);
        return;
      }
      setError(res.error);
    },
    [onSession, people],
  );

  return { people, peopleError, busy, error, attemptsLeft, lockedForSec, lockedAt, demoFallback, submit };
}
