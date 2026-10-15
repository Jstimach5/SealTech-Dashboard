/** A tier A or tier B tabular number. */
interface Props {
  value: number | string;
  tier: 'a' | 'b';
  tone?: 'brand' | 'ink' | 'act';
  testId?: string;
}

export function BigNumber({ value, tier, tone = 'ink', testId }: Props) {
  const color = tone === 'brand' ? 'var(--brand)' : tone === 'act' ? 'var(--act)' : 'var(--ink)';
  return (
    <span className={`tier-${tier}`} style={{ color, fontVariantNumeric: 'tabular-nums', display: 'block' }} {...(testId !== undefined ? { 'data-testid': testId } : {})}>
      {value}
    </span>
  );
}
