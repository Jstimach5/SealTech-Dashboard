/** Small outlined tag (tier D): NO-REMINDER, NO CHARGE?, ⚠ 20+ d UNSUBMITTED, fixtures, DPR. */
interface Props {
  text: string;
  tone?: 'act' | 'amber' | 'muted' | 'move';
  testId?: string;
  /** Keep the text as written, in the normal tag weight (tags are uppercase by default). */
  lower?: boolean;
  /** Keep the letter case as written but the tag's bold weight (`⚠ 20+ d UNSUBMITTED`). */
  keepCase?: boolean;
}

export function Tag({ text, tone = 'muted', testId, lower = false, keepCase = false }: Props) {
  return (
    <span className={`tag tag--${tone} ${lower ? 'tag--lower' : ''} ${keepCase ? 'tag--case' : ''}`} {...(testId !== undefined ? { 'data-testid': testId } : {})}>
      {text}
    </span>
  );
}
