/** Small outlined tag (tier D): NO-REMINDER, NO CHARGE?, fixtures, DPR. */
interface Props {
  text: string;
  tone?: 'act' | 'amber' | 'muted' | 'move';
  testId?: string;
  /** Keep the text as written (tags are uppercase by default). */
  lower?: boolean;
}

export function Tag({ text, tone = 'muted', testId, lower = false }: Props) {
  return (
    <span className={`tag tag--${tone} ${lower ? 'tag--lower' : ''}`} {...(testId !== undefined ? { 'data-testid': testId } : {})}>
      {text}
    </span>
  );
}
