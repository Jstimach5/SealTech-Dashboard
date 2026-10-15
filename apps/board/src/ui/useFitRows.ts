/**
 * How many fixed-height rows fit in a container: zones clip, never scroll, and a row is shown whole
 * or not at all, with `+N more` where rows are cut.
 */
import { useLayoutEffect, useState, type RefObject } from 'react';

export interface ZoneSize {
  width: number;
  height: number;
}

/** The container's current client size, kept fresh by a ResizeObserver (0×0 until measured). */
export function useZoneSize(ref: RefObject<HTMLElement | null>): ZoneSize {
  const [size, setSize] = useState<ZoneSize>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function useZoneHeight(ref: RefObject<HTMLElement | null>): number {
  return useZoneSize(ref).height;
}

/** Whole rows of `rowHeight` (with `gap` between them) that fit in `height` after `reserve` px are set aside. */
export function fitRows(height: number, rowHeight: number, gap: number, reserve: number = 0): number {
  const free = height - reserve;
  if (free <= 0) return 0;
  return Math.max(0, Math.floor((free + gap) / (rowHeight + gap)));
}

export function useFitRows(ref: RefObject<HTMLElement | null>, rowHeight: number, gap: number, reserve: number = 0): number {
  return fitRows(useZoneHeight(ref), rowHeight, gap, reserve);
}

/** Split `total` items into the shown count and the hidden count, reserving one row for `+N more` when needed. */
export function clipRows(total: number, fits: number, max: number = Number.POSITIVE_INFINITY, moreTakesRow: boolean = true): { shown: number; hidden: number } {
  const cap = Math.min(total, max, fits);
  if (cap >= total) return { shown: total, hidden: 0 };
  const shown = moreTakesRow ? Math.max(0, cap - 1) : cap;
  return { shown, hidden: total - shown };
}
