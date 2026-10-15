/** A status chip: icon AND word from the domain's chipLabel; tone → house palette. */
import { chipLabel, type CardState } from '@sealtech/domain';
import { FitText } from './FitText';

interface Props {
  state: Pick<CardState, 'chipIcon' | 'chipWord' | 'tone'>;
  /** Shrinks from tier C to tier D to fit the lane. */
  fit?: boolean;
  className?: string;
}

export function Chip({ state, fit = false, className }: Props) {
  const label = chipLabel(state);
  const cls = `chip chip--${state.tone} ${className ?? ''}`;
  if (fit) {
    return (
      <span className={cls} data-tone={state.tone} style={{ display: 'block', fontSize: 'var(--tier-c)' }}>
        <FitText text={label} max={42} min={24} />
      </span>
    );
  }
  return (
    <span className={cls} data-tone={state.tone} style={{ fontSize: 'var(--tier-c)' }}>
      {label}
    </span>
  );
}
