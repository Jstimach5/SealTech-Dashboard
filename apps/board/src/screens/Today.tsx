/** The default screen (decision 2, 25): scoreline, NEEDS ATTENTION, crew lanes, counts, the CANNOT INVOICE rail. */
import { AttentionStrip } from '../zones/AttentionStrip';
import { CountsStrip } from '../zones/CountsStrip';
import { CrewLanes } from '../zones/CrewLanes';
import { Rail } from '../zones/Rail';
import { Scoreline } from '../zones/Scoreline';

export function Today() {
  return (
    <main className="today" data-testid="screen-today">
      <Scoreline />
      <AttentionStrip />
      <CrewLanes />
      <CountsStrip />
      <Rail />
    </main>
  );
}
