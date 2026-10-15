/**
 * The wall's one icon set (revision G). Inline SVG, so every glyph renders the same on the kiosk PC as
 * in CI (six of the old text glyphs were not in Inter and fell back to random fonts). The word next to
 * the icon carries the meaning; the icon is aria-hidden. ⚠ means Problem, Late and Still open only.
 */
import type { IconName } from '@sealtech/domain';

const PATHS: Record<IconName, JSX.Element> = {
  problem: (
    <>
      <path d="M12 3 2 21h20L12 3z" />
      <path d="M12 10v5M12 18v.01" />
    </>
  ),
  late: (
    <>
      <path d="M12 3 2 21h20L12 3z" />
      <path d="M12 10v5M12 18v.01" />
    </>
  ),
  still: (
    <>
      <path d="M12 3 2 21h20L12 3z" />
      <path d="M12 10v5M12 18v.01" />
    </>
  ),
  review: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 9 9h-9z" fill="currentColor" />
    </>
  ),
  hold: <path d="M8 5v14M16 5v14" />,
  fix: <path d="M4 20l4-1 11-11-3-3L5 16z" />,
  ready: <path d="M2 13l4 4 8-9M10 15l2 2 8-9" />,
  action: <path d="M5 21V4h11l-2 4 2 4H5" />,
  form: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  noanswer: (
    <>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
      <path d="M12 16v.01M10 9.5a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.6" />
    </>
  ),
  return: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  retest: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </>
  ),
  inspection: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  now: <circle cx="12" cy="12" r="7" fill="currentColor" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5h4" />
    </>
  ),
  done: <path d="M4 13l5 5L20 6" />,
  prepped: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </>
  ),
  notstarted: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 18 18 6" />
    </>
  ),
  cancelled: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-icon={name}>
      {PATHS[name]}
    </svg>
  );
}
