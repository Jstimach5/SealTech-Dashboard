/** Every `/api/*` route in docs/http-api.md, by exact path. Unknown `/api/*` paths are 404. */
import type { Handler } from '../context.js';
import { flag } from './flag.js';
import { ack, recap } from './notes.js';
import { owner } from './owner.js';
import { people, pin } from './pin.js';
import { review } from './review.js';
import { focus, responder } from './settings.js';
import { tap } from './tap.js';

export interface Route {
  method: 'GET' | 'POST';
  handler: Handler;
}

export const ROUTES: Readonly<Record<string, Route>> = {
  '/api/pin': { method: 'POST', handler: pin },
  '/api/people': { method: 'GET', handler: people },
  '/api/review': { method: 'POST', handler: review },
  '/api/recap': { method: 'POST', handler: recap },
  '/api/ack': { method: 'POST', handler: ack },
  '/api/focus': { method: 'POST', handler: focus },
  '/api/responder': { method: 'POST', handler: responder },
  '/api/flag': { method: 'POST', handler: flag },
  '/api/owner': { method: 'POST', handler: owner },
  '/api/tap': { method: 'POST', handler: tap },
};
