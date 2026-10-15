/**
 * One line of text that shrinks from `max` to fit its container's width, never below `min`
 * (tier D, 24 px, is the floor everywhere). Measured with a hidden DOM probe that carries the same
 * font, numeric variant and letter-spacing (a canvas would ignore tabular digits); re-measured when
 * the container resizes or the web font lands. With `wrap`, text that still does not fit at `min`
 * is allowed to wrap instead of being clipped.
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

export function FitText({ text, max, min, wrap = false, className, style, title }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  const [wrapping, setWrapping] = useState(false);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const avail = el.clientWidth;
    if (avail <= 0) return;
    const cs = getComputedStyle(el);
    const current = parseFloat(cs.fontSize) || max;
    const width = measure(text, cs, max, current);
    let next = max;
    if (width > avail && width > 0) next = Math.max(min, Math.floor((max * avail * 0.99) / width));
    setSize(next);
    setWrapping(wrap && next === min && (width * min) / max > avail);
  }, [text, max, min, wrap]);

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
      {text}
    </span>
  );
}
