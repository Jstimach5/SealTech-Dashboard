/** The PIN screen in front of REVIEW and SCORECARD (decisions 16, 20). */
import { useBoard } from '../context';
import { usePin } from '../pin/usePin';
import { Button } from '../ui/Button';
import { PinPad } from '../ui/PinPad';

export function PinGate({ title, testId }: { title: string; testId: string }) {
  const { snapshot, setSession, go } = useBoard();
  const pin = usePin(snapshot, setSession);
  return (
    <main className="screen pin-screen" data-testid={testId}>
      <div className="screen__bar">
        <span className="tier-c bold brand">{title} 🔒</span>
        <span className="tier-d muted">{title === 'ACK' ? 'PIN required · the ACK goes into the Jobber visit note' : 'PIN required · nothing here goes on the wall'}</span>
        <span className="screen__bar-spacer" />
        <Button label="back to today" small tone="quiet" testId="pin-cancel" onClick={() => go('today', `${title.toLowerCase()}:back`)}>
          ← TODAY
        </Button>
      </div>
      <PinPad pin={pin} title={title} />
    </main>
  );
}
