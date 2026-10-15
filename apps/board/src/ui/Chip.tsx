/** A status chip: icon AND word from the domain's chipLabel; tone → house palette. */
import { chipLabel, type CardState } from '@sealtech/domain';
import { FitText } from './FitText';

interface Props {
  state: Pick<CardState, 'chipIcon' | 'chipWord' | 'tone'>;
  /** Shrinks from tier C to tier D to fit the lane, then wraps to two lines (never cut). */
  fit?: boolean;
  className?: string;
}

export function Chip({ state, fit = false, className }: Props) {
  const label = chipLabel(state);
  const cls = `chip chip--${state.tone} ${className ?? ''}`;
  if (fit) {
    return (
      <span className={cls} data-tone={state.tone} style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--tier-c)' }}>
        <FitText text={label} max={42} min={24} wrap />
      </span>
    );
  }
  return (
    <span className={cls} data-tone={state.tone} style={{ fontSize: 'var(--tier-c)' }}>
      {label}
    </span>
  );
}
