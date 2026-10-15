/** The PIN screen in front of REVIEW, SCORECARD, the ACK and the OWNER pick (decisions 16, 20, 33, 41). */
import { useBoard } from '../context';
import { usePin } from '../pin/usePin';
import { Button } from '../ui/Button';
import { PinPad } from '../ui/PinPad';

interface Props {
  title: string;
  testId: string;
  /** Only these roles get a name tile (default: office, owner and crew leads). */
  roles?: ReadonlySet<string>;
  /** What ← back does; default: back to TODAY. */
  onCancel?: () => void;
  cancelLabel?: string;
}

const SUBTITLE: Record<string, string> = {
  ACK: 'PIN required · office or owner · the ACK goes into the Jobber visit note',
  OWNER: 'PIN required · office or owner · huddle owner change for one line',
};

export function PinGate({ title, testId, roles, onCancel, cancelLabel }: Props) {
  const { snapshot, setSession, go } = useBoard();
  const pin = usePin(snapshot, setSession, roles);
  return (
    <main className="screen pin-screen" data-testid={testId}>
      <div className="screen__bar">
        <span className="tier-c bold brand">{title} 🔒</span>
        <span className="tier-d muted">{SUBTITLE[title] ?? 'PIN required · nothing here goes on the wall'}</span>
        <span className="screen__bar-spacer" />
        <Button label={cancelLabel ?? 'back to today'} small tone="quiet" testId="pin-cancel" onClick={onCancel ?? (() => go('today', `${title.toLowerCase()}:back`))}>
          {cancelLabel ? '← back' : '← TODAY'}
        </Button>
      </div>
      <PinPad pin={pin} title={title} />
    </main>
  );
}
