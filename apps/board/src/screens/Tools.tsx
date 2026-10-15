/** Office tools on REVIEW (office/owner only): FLAG → KPI Flags tab (decisions 14, 15), FOCUS line (35), RESPONDER (41). */
import { useState } from 'react';
import { ISSUE_TYPES, type IssueType } from '@sealtech/domain';
import { useBoard } from '../context';
import { api } from '../data/api';
import type { Session } from '../pin/usePin';
import { Button } from '../ui/Button';

type Tool = 'none' | 'focus' | 'responder' | 'flag';

export function Tools({ session }: { session: Session }) {
  const [tool, setTool] = useState<Tool>('none');
  return (
    <section className="card review__tools" data-testid="tools" aria-label="office tools">
      <div className="review__tool-tabs">
        <Button label="set the focus line" small selected={tool === 'focus'} testId="tool-focus" onClick={() => setTool(tool === 'focus' ? 'none' : 'focus')}>
          FOCUS
        </Button>
        <Button label="pick today's responder" small selected={tool === 'responder'} testId="tool-responder" onClick={() => setTool(tool === 'responder' ? 'none' : 'responder')}>
          RESPONDER
        </Button>
        <Button label="flag an issue" small selected={tool === 'flag'} testId="tool-flag" onClick={() => setTool(tool === 'flag' ? 'none' : 'flag')}>
          FLAG
        </Button>
      </div>
      {tool === 'focus' && <FocusForm session={session} />}
      {tool === 'responder' && <ResponderForm session={session} />}
      {tool === 'flag' && <FlagForm session={session} />}
    </section>
  );
}

function useSubmit(session: Session) {
  const { refresh, setSession } = useBoard();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  const post = async (path: string, body: unknown): Promise<boolean> => {
    setBusy(true);
    setStatus(undefined);
    const res = await api(path, { body, token: session.token });
    setBusy(false);
    // An expired or unknown token: back to the PIN gate.
    if (!res.ok && res.status === 401) {
      setSession(undefined);
      return false;
    }
    setStatus(res.ok ? { ok: true, text: 'saved' } : { ok: false, text: res.error });
    if (res.ok) refresh();
    return res.ok;
  };
  return { busy, status, post };
}

function Status({ status, busy }: { status: { ok: boolean; text: string } | undefined; busy: boolean }) {
  return (
    <span className="tool__status" aria-live="polite">
      {busy && <span className="note">sending…</span>}
      {status && <span className={`note ${status.ok ? 'note--auto' : 'note--act'}`}>{status.text}</span>}
    </span>
  );
}

function FocusForm({ session }: { session: Session }) {
  const { snapshot } = useBoard();
  const [text, setText] = useState(snapshot.focusLine);
  const { busy, status, post } = useSubmit(session);
  return (
    <form
      className="tool"
      data-testid="focus-form"
      onSubmit={(e) => {
        e.preventDefault();
        void post('/api/focus', { text: text.trim().toUpperCase() });
      }}
    >
      <label className="tier-d caps bold muted" htmlFor="focus-text">
        Focus line · {text.length}/30
      </label>
      <input id="focus-text" className="tool__input" maxLength={30} value={text} onChange={(e) => setText(e.target.value.toUpperCase())} />
      <div className="tool__row">
        <Button label="save the focus line" small tone="fill" testId="focus-save" disabled={busy || text.trim() === ''} type="submit">
          save
        </Button>
        <Status status={status} busy={busy} />
      </div>
    </form>
  );
}

function ResponderForm({ session }: { session: Session }) {
  const { snapshot } = useBoard();
  const { busy, status, post } = useSubmit(session);
  const office = snapshot.people.filter((p) => p.role === 'office' || p.role === 'owner');
  return (
    <div className="tool" data-testid="responder-form">
      <span className="tier-d caps bold muted">Who answers Problems today? · now {snapshot.responderInitials ?? '—'}</span>
      <div className="tool__tiles">
        {office.map((p) => (
          <Button key={p.jobberUserId} label={`responder ${p.lastName}`} small selected={snapshot.responderInitials === p.initials} disabled={busy} onClick={() => void post('/api/responder', { initials: p.initials })}>
            {p.initials} · {p.lastName}
          </Button>
        ))}
      </div>
      <Status status={status} busy={busy} />
    </div>
  );
}

function FlagForm({ session }: { session: Session }) {
  const { snapshot } = useBoard();
  const { busy, status, post } = useSubmit(session);
  const [issue, setIssue] = useState<IssueType | undefined>(undefined);
  const [employee, setEmployee] = useState('');
  const [crew, setCrew] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [rr, setRr] = useState<'Y' | 'N' | undefined>(undefined);
  const ready = issue !== undefined && employee.trim() !== '' && crew !== '' && /^\d+$/.test(jobNumber) && rr !== undefined;
  return (
    <form
      className="tool"
      data-testid="flag-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        void post('/api/flag', { issue, jobNumber: Number(jobNumber), employee: employee.trim(), crewOnReport: crew, notes: notes.trim(), rr }).then((ok) => {
          if (ok) {
            setIssue(undefined);
            setEmployee('');
            setCrew('');
            setJobNumber('');
            setNotes('');
            setRr(undefined);
          }
        });
      }}
    >
      <span className="tier-d caps bold muted">Issue</span>
      <div className="tool__tiles">
        {ISSUE_TYPES.map((t) => (
          <Button key={t} label={`issue ${t}`} small selected={issue === t} onClick={() => setIssue(t)}>
            {t}
          </Button>
        ))}
      </div>
      <div className="tool__grid">
        <label className="tool__field">
          <span className="tier-d caps bold muted">Employee</span>
          <input className="tool__input" value={employee} onChange={(e) => setEmployee(e.target.value)} />
        </label>
        <label className="tool__field">
          <span className="tier-d caps bold muted">Job number</span>
          <input className="tool__input" inputMode="numeric" value={jobNumber} onChange={(e) => setJobNumber(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <span className="tier-d caps bold muted">Crew</span>
      <div className="tool__tiles">
        {snapshot.crews.map((c) => (
          <Button key={c.leadUserId} label={`crew ${c.leadLastName}`} small selected={crew === c.leadLastName} onClick={() => setCrew(c.leadLastName)}>
            {c.leadLastName}
          </Button>
        ))}
      </div>
      <label className="tool__field">
        <span className="tier-d caps bold muted">Notes</span>
        <textarea className="tool__input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="tool__row">
        <span className="tier-d caps bold muted">RR</span>
        <Button label="RR yes" small selected={rr === 'Y'} onClick={() => setRr('Y')}>
          Y
        </Button>
        <Button label="RR no" small selected={rr === 'N'} onClick={() => setRr('N')}>
          N
        </Button>
        <Button label="save the flag" small tone="fill" testId="flag-save" disabled={busy || !ready} type="submit">
          save flag
        </Button>
        <Status status={status} busy={busy} />
      </div>
    </form>
  );
}
