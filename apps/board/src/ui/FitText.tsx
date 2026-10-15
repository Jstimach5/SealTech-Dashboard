/**
 * One line of text that shrinks from `max` to fit its container's width, never below `min`
 * (tier D, 24 px, is the floor everywhere). Measured with a hidden DOM probe that carries the same
 * font, numeric variant and letter-spacing (a canvas would ignore tabular digits); re-measured when
 * the container resizes or the web font lands. With `wrap`, text that still does not fit at `min`
 * is allowed to wrap instead of being clipped. With `fallbacks`, a shorter form is printed when the
 * text would not fit at `min` (the full text stays in the aria-label).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

interface Props {
  text: string;
  max: number;
  min: number;
  wrap?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  /** Shorter forms, tried in order when `text` does not fit at `min`. */
  fallbacks?: readonly string[] | undefined;
}

let probe: HTMLSpanElement | undefined;
function measure(text: string, cs: CSSStyleDeclaration, px: number, currentPx: number): number {
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;top:-10000px;left:-10000px;visibility:hidden;white-space:nowrap;pointer-events:none;line-height:1';
    document.body.appendChild(probe);
  }
  probe.style.fontFamily = cs.fontFamily;
  probe.style.fontWeight = cs.fontWeight;
  probe.style.fontStyle = cs.fontStyle;
  probe.style.fontSize = `${px}px`;
  probe.style.fontVariantNumeric = cs.fontVariantNumeric;
  probe.style.fontFeatureSettings = cs.fontFeatureSettings;
  probe.style.textTransform = cs.textTransform;
  const spacing = parseFloat(cs.letterSpacing);
  probe.style.letterSpacing = Number.isFinite(spacing) && currentPx > 0 ? `${(spacing * px) / currentPx}px` : '0px';
  probe.textContent = text;
  return probe.getBoundingClientRect().width;
}

export function FitText({ text, max, min, wrap = false, className, style, title, fallbacks }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  const [wrapping, setWrapping] = useState(false);
  const [printed, setPrinted] = useState(text);
  const fallbackKey = (fallbacks ?? []).join('\u0000');

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const avail = el.clientWidth;
    if (avail <= 0) return;
    const cs = getComputedStyle(el);
    const current = parseFloat(cs.fontSize) || max;
    const candidates = [text, ...(fallbackKey === '' ? [] : fallbackKey.split('\u0000'))];
    let chosen = text;
    let next = max;
    let width = 0;
    for (const candidate of candidates) {
      chosen = candidate;
      width = measure(candidate, cs, max, current);
      next = max;
      if (width > avail && width > 0) next = Math.max(min, Math.floor((max * avail * 0.99) / width));
      if ((width * next) / max <= avail) break;
    }
    setPrinted(chosen);
    setSize(next);
    setWrapping(wrap && next === min && (width * min) / max > avail);
  }, [text, max, min, wrap, fallbackKey]);

  useLayoutEffect(fit, [fit]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    const fonts = document.fonts;
    const onFonts = () => fit();
    fonts?.addEventListener?.('loadingdone', onFonts);
    void fonts?.ready?.then(onFonts);
    return () => {
      ro.disconnect();
      fonts?.removeEventListener?.('loadingdone', onFonts);
    };
  }, [fit]);

  return (
    <span
      ref={ref}
      className={className}
      {...(title !== undefined ? { title } : {})}
      {...(printed !== text ? { 'aria-label': text } : {})}
      style={{
        display: 'block',
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: wrapping ? 'normal' : 'nowrap',
        textOverflow: wrapping ? 'clip' : 'ellipsis',
        fontSize: `${size}px`,
        ...style,
      }}
    >
      {printed === text || candidatesInclude(fallbacks, printed) ? printed : text}
    </span>
  );
}

function candidatesInclude(fallbacks: readonly string[] | undefined, printed: string): boolean {
  return fallbacks?.includes(printed) ?? false;
}
