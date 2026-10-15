/**
 * The one no-ACK alert (decision 41): a Problem that nobody acknowledged within CONFIG.ACK_MIN minutes
 * sends ONE email-to-SMS to ALERT_TO, once per visit, ever (table `alerts_sent`). Visual only on the
 * wall; no sounds. The only mailer today logs the would-be message; SMTP comes later behind the same
 * interface. The message carries the card label only — never dollars, address or phone (decision 4).
 */
import { CONFIG, attentionLabel, problemAckOverdue, type Snapshot, type Visit } from '@sealtech/domain';
import type { ServiceConfig } from './config.js';
import type { Logger } from './log.js';
import type { BoardDb } from './state/db.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Logs the message instead of sending it. The recipient is never logged: ALERT_TO is the owner's
 * email-to-SMS address, i.e. his phone number, and the log sits on a shared PC.
 */
export class LogMailer implements Mailer {
  constructor(private readonly log: Logger) {}
  async send(message: MailMessage): Promise<void> {
    const who = message.to ? 'alert queued for the owner' : 'alert not sent (ALERT_TO unset)';
    this.log.info(`${who}: ${message.subject} — ${message.text}`);
  }
}

/** Collects messages so tests can assert on them. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export interface AlertDeps {
  db: BoardDb;
  config: ServiceConfig;
  mailer: Mailer;
}

export function alertMessage(visit: Visit, snapshot: Snapshot, to: string): MailMessage {
  const job = snapshot.jobs.find((j) => j.id === visit.jobId);
  const label = job ? attentionLabel(job) : visit.jobId;
  return {
    to,
    subject: 'SealTech board: Problem not acknowledged',
    text: `${label}: Problem with no ACK after ${CONFIG.ACK_MIN} min (${visit.missReason ?? 'no reason'}). Responder: ${snapshot.responderInitials ?? '—'}.`,
  };
}

/** Sends the alert for one visit if it is overdue and never alerted. Returns true when a message went out. */
export async function noAckAlert(visit: Visit, snapshot: Snapshot, deps: AlertDeps): Promise<boolean> {
  if (!problemAckOverdue(visit, snapshot.generatedAt)) return false;
  if (deps.db.alertSent(visit.id)) return false;
  await deps.mailer.send(alertMessage(visit, snapshot, deps.config.alertTo ?? ''));
  deps.db.markAlertSent(visit.id, snapshot.generatedAt);
  return true;
}

/** Runs after every successful build. Returns the visit ids alerted this time. */
export async function runNoAckAlerts(snapshot: Snapshot, deps: AlertDeps): Promise<string[]> {
  const sent: string[] = [];
  for (const visit of snapshot.visits) if (await noAckAlert(visit, snapshot, deps)) sent.push(visit.id);
  return sent;
}
