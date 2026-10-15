import { createContext, useContext } from 'react';
import type { Instant, Snapshot } from '@sealtech/domain';
import type { Session } from './pin/usePin';

export type Screen = 'today' | 'stages' | 'cannot-invoice' | 'review' | 'scorecard';

export const SCREEN_TITLE: Record<Screen, string> = {
  today: 'TODAY',
  stages: 'STAGES',
  'cannot-invoice': 'CANNOT INVOICE',
  review: 'REVIEW 🔒',
  scorecard: 'SCORECARD 🔒',
};

export interface Board {
  snapshot: Snapshot;
  now: Instant;
  displayNow: Instant;
  frozen: boolean;
  screen: Screen;
  /** Change screen and record the tap. */
  go: (screen: Screen, target: string) => void;
  session: Session | undefined;
  setSession: (s: Session | undefined) => void;
  /** ACK a Problem (decision 41): asks for a PIN first when there is no session, then POSTs /api/ack. */
  requestAck: (visitId: string) => void;
  /** The last ACK outcome per visit: 'queued' or the error sentence. */
  ackNotes: Record<string, string>;
  /** Re-poll the snapshot now (after a write). */
  refresh: () => void;
  lastFetchOk: boolean;
  error: string | undefined;
  tick: number;
}

export const BoardContext = createContext<Board | undefined>(undefined);

export function useBoard(): Board {
  const b = useContext(BoardContext);
  if (!b) throw new Error('useBoard outside BoardContext');
  return b;
}
