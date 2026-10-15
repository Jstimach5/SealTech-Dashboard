/** A real <button>, at least 48×48, with an aria-label. */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  tone?: 'line' | 'fill' | 'act' | 'amber' | 'auto' | 'move' | 'quiet';
  small?: boolean;
  selected?: boolean;
  testId?: string;
  label: string;
}

export function Button({ children, tone = 'line', small = false, selected = false, testId, label, className, ...rest }: Props) {
  const cls = ['btn', tone !== 'line' ? `btn--${tone}` : '', small ? 'btn--small' : '', selected ? 'btn--selected' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} aria-label={label} aria-pressed={selected ? true : undefined} {...(testId !== undefined ? { 'data-testid': testId } : {})} {...rest}>
      {children}
    </button>
  );
}
