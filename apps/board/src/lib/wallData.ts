/** Everything the TODAY wall prints, computed once per render from the domain rules (no rule lives here). */
import { useMemo } from 'react';
import {
  crewRows,
  firstPassLine,
  headline,
  keptLine,
  ledgerSlots,
  metaLine,
  moneyLines,
  moneySlots,
  needsYou,
  staleLine,
  type CrewRow,
  type Headline,
  type LedgerRow,
  type MoneyLine,
} from '@sealtech/domain';
import { useBoard } from '../context';

export interface WallData {
  head: Headline;
  focus: string;
  right: string;
  stale: boolean;
  kept: string;
  rows: LedgerRow[];
  visible: LedgerRow[];
  hidden: LedgerRow[];
  names: string;
  hero: number;
  money: MoneyLine[];
  moneyShown: number;
  crews: CrewRow[];
  meta: string;
}

/** Decision 41's focus line arrives as typed; older entries were stored upper-case. */
function focusText(focus: string): string {
  const t = focus.trim();
  if (!t) return '';
  if (t !== t.toUpperCase()) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function useWallData(): WallData {
  const { snapshot: s, now } = useBoard();
  return useMemo(() => {
    const rows = needsYou(s, now);
    const slots = ledgerSlots(rows);
    const stale = staleLine(s, now);
    return {
      head: headline(rows, s, now),
      focus: focusText(s.focusLine),
      right: stale ?? firstPassLine(s),
      stale: stale !== undefined,
      kept: keptLine(s),
      rows,
      visible: slots.visible,
      hidden: slots.hidden,
      names: slots.names,
      hero: s.hero.cannotInvoice,
      money: moneyLines(s, now),
      moneyShown: moneySlots(s.crews.length),
      crews: crewRows(s, now),
      meta: metaLine(s, now),
    };
  }, [s, now]);
}
