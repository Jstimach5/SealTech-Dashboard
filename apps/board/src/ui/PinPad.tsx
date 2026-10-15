/**
 * Name tiles + a 4-digit keypad (keys ≥ 96×96). The PIN never shows; four dots do. 423 lockouts
 * count down from the service's `lockedForSec`.
 */
import { useEffect, useState } from 'react';
import type { PinPerson, PinState } from '../pin/usePin';
import { Button } from './Button';

interface Props {
  pin: PinState;
  title: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'] as const;

export function PinPad({ pin, title }: Props) {
  const [who, setWho] = useState<PinPerson | undefined>(undefined);
  const [digits, setDigits] = useState('');
  const [left, setLeft] = useState(0);

  useEffect(() => {
    setLeft(pin.lockedForSec);
    if (pin.lockedForSec <= 0) return;
    const id = window.setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [pin.lockedForSec, pin.lockedAt]);

  const submit = (code: string) => {
    if (!who || code.length !== 4 || pin.busy) return;
    setDigits('');
    void pin.submit(who.jobberUserId, code);
  };

  const press = (k: string) => {
    if (left > 0) return;
    if (k === '⌫') setDigits((d) => d.slice(0, -1));
    else if (k === 'OK') submit(digits);
    else if (digits.length < 4) {
      const next = digits + k;
      setDigits(next);
      if (next.length === 4) submit(next);
    }
  };

  return (
    <div className="pin" data-testid="pin-pad">
      <div className="pin__people">
        <div className="tier-d caps muted">{title} · who are you?</div>
        <div className="pin__tiles">
          {pin.people.map((p) => (
            <Button
              key={p.jobberUserId}
              label={`I am ${p.lastName}`}
              testId={`pin-tile-${p.jobberUserId}`}
              selected={who?.jobberUserId === p.jobberUserId}
              onClick={() => {
                setWho(p);
                setDigits('');
              }}
            >
              <span className="pin__tile-name">{p.lastName}</span>
              <span className="tier-d caps pin__tile-role">{p.role === 'crewLead' ? 'crew lead' : p.role}</span>
            </Button>
          ))}
          {pin.people.length === 0 && <div className="note">no people listed{pin.peopleError ? ` · ${pin.peopleError}` : ''}</div>}
        </div>
      </div>
      <div className="pin__pad">
        <div className="tier-d caps muted">{who ? `${who.lastName} · PIN` : 'tap your name first'}</div>
        <div className="pin__dots" aria-label={`${digits.length} of 4 digits`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pin__dot ${i < digits.length ? 'pin__dot--on' : ''}`} />
          ))}
        </div>
        <div className="pin__keys">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`pin__key ${k === 'OK' ? 'pin__key--ok' : ''} ${k === '⌫' ? 'pin__key--back' : ''}`}
              data-testid={`pin-key-${k === '⌫' ? 'back' : k === 'OK' ? 'ok' : k}`}
              aria-label={k === '⌫' ? 'delete digit' : k === 'OK' ? 'submit PIN' : `digit ${k}`}
              disabled={!who || left > 0 || pin.busy}
              onClick={() => press(k)}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="pin__status" aria-live="polite">
          {left > 0 ? (
            <span className="note note--act">locked · try again in {left} s</span>
          ) : pin.error ? (
            <span className="note note--act">
              {pin.error}
              {pin.attemptsLeft !== undefined ? ` · ${pin.attemptsLeft} left` : ''}
            </span>
          ) : pin.busy ? (
            <span className="note">checking…</span>
          ) : pin.demoFallback ? (
            <span className="note">demo · needs the service · PIN 1234</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
