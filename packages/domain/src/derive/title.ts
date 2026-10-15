/**
 * Jobber job-title parser. Titles follow `CITY - TOKEN TYPE - LAST`
 * (`KZOO - Consumers Install - Kaplan`) and the wall shows only
 * `LASTNAME · CITY · SCOPE` (decision 4: last name + city + scope, never dollars,
 * street address or phone). Pure functions; nothing here touches time or I/O.
 */
import { TITLE_TOKENS } from '../enums.js';
import type { Program, Scope } from '../enums.js';

export interface TitleParse {
  lastName: string;
  city: string;
  scope: Scope;
  program: Program;
  /** `LASTNAME · CITY · SCOPE` */
  label: string;
  /** The TITLE_TOKENS key that matched, e.g. `CONSUMERS`. Absent when no token was found. */
  token?: string;
  /** Type text left once the token is removed, as uppercase words, e.g. `INSTALL`. Absent when blank. */
  typeWord?: string;
}

export interface TitleInput {
  title: string | null | undefined;
  clientName?: string;
  propertyCity?: string;
  instructions?: string | null;
}

/** Placeholder for a blank label part and the "nothing recognisable" scope (same glyph as enums.SCOPES). */
const DASH = '—';
/** City characters the wall has room for; longer cities are cut to CITY_MAX - 1 + '.'. */
const CITY_MAX = 10;
/** Title parts are separated by a spaced hyphen, en dash or em dash. */
const SEPARATOR = /\s+[-–—]\s+/;

/** TITLE_TOKENS keys longest first, so `CONSUMERS HVAC` wins over `CONSUMERS` and `HVAC`; ties keep enum order. */
const TOKENS_LONGEST_FIRST: string[] = Object.keys(TITLE_TOKENS).sort((a, b) => b.length - a.length);

// Scope vocabulary, tested against `words()` output (uppercase, punctuation gone), so `\b` is safe.
const EVAL_WORDS = /\b(EVAL|ESTIMAT|ASSESS)/;
const HVAC_WORDS = /\b(HVAC|FURNACE|BOILER|REPLACEMENT)/;
const SVC_WORDS = /\b(SERVICE|REPAIR|FIX|WARRANT)/;
const WALL_WORDS = /\bWALLS?\b/;
const AIR_WORDS = /\bAIR SEAL/;
const BD_WORDS = /\bBLOWER|\bBD\b/;
const ATT_WORDS = /\b(INSTALL|REVISIT|ATTIC|CRAWL|BASEMENT|CLOSED CELL|OPEN CELL|SPRAY)|\bRIM\b/;
const ANY_SCOPE_WORD = new RegExp(
  [EVAL_WORDS, HVAC_WORDS, SVC_WORDS, WALL_WORDS, AIR_WORDS, BD_WORDS, ATT_WORDS].map((r) => r.source).join('|'),
);

/** Uppercase words only: punctuation becomes a space so `BISE(old job)` and `AIR-SEAL` read as words. */
export function words(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** A name as the wall shows it: uppercase, single spaces, straight apostrophe. */
export function cleanName(name: string): string {
  return name.replace(/’/g, "'").trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Last whitespace-separated word of a client name, letters/hyphen/apostrophe only (`DANNY  BERGMOSER` → `BERGMOSER`). */
export function lastNameOf(clientName: string): string {
  const last = clientName.trim().split(/\s+/).pop() ?? '';
  return cleanName(last.replace(/’/g, "'").replace(/[^\p{L}'-]/gu, ''));
}

/** City as the wall shows it: uppercase, at most CITY_MAX chars (`Frenchtown Township` → `FRENCHTOW.`). */
export function shortCity(city: string): string {
  const c = city.trim().replace(/\s+/g, ' ').toUpperCase();
  return c.length <= CITY_MAX ? c : `${c.slice(0, CITY_MAX - 1).trimEnd()}.`;
}

/** The program token in the type text, matched as whole words, longest token first; none → undefined. */
export function findToken(typeText: string): string | undefined {
  const padded = ` ${words(typeText)} `;
  return TOKENS_LONGEST_FIRST.find((t) => padded.includes(` ${t} `));
}

/** Type words with the token removed (`Consumers Install` → `INSTALL`); '' when only the token was there. */
export function typeWordOf(typeText: string, token: string | undefined): string {
  const w = words(typeText);
  if (token === undefined) return w;
  return ` ${w} `.replace(` ${token} `, ' ').trim().replace(/\s+/g, ' ');
}

/** Program from the token. No token = PROGRAM: fail-closed, anything not positively Standard is program work (decision 1 / rule 7). */
export function programFor(token: string | undefined): Program {
  if (token === undefined) return 'PROGRAM';
  return TITLE_TOKENS[token] ?? 'PROGRAM';
}

/**
 * Scope from the type text; instructions may only refine an insulation job to WALL / AIR / BD.
 * Order: EVAL beats HVAC, then SVC, then the insulation sub-scopes, then ATT, else '—'.
 */
export function scopeFor(args: { typeText: string; typeWord: string; instructions: string; program: Program }): Scope {
  const type = words(args.typeText);
  const typeAndNotes = `${type} ${words(args.instructions)}`;
  if (EVAL_WORDS.test(type)) return 'EVAL';
  if (args.program === 'CE_HVAC' || HVAC_WORDS.test(type)) return 'HVAC';
  if (SVC_WORDS.test(type)) return 'SVC';
  if (WALL_WORDS.test(typeAndNotes)) return 'WALL';
  if (AIR_WORDS.test(typeAndNotes)) return 'AIR';
  if (BD_WORDS.test(typeAndNotes)) return 'BD';
  if (args.typeWord === '' && args.program !== 'PROGRAM') return 'ATT'; // token with a blank type = attic install
  if (ATT_WORDS.test(type)) return 'ATT';
  return DASH;
}

/** True when a title part reads as the job type rather than a name (`HVAC REPLACEMENT`, `CLOSED CELL`). */
export function readsAsType(part: string): boolean {
  return findToken(part) !== undefined || ANY_SCOPE_WORD.test(words(part));
}

/** Splits a title on spaced dashes and drops blank parts. */
export function splitTitle(title: string): string[] {
  return title
    .split(SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

/**
 * Assigns raw title parts: 3+ = city / type / last, 2 = city / type (last from the client),
 * 1 or none = type only (city and last from the property and client).
 */
export function assignParts(parts: string[], input: TitleInput): { city: string; lastName: string; typeText: string } {
  const clientLast = lastNameOf(input.clientName ?? '');
  if (parts.length >= 3) {
    let lastName = parts[parts.length - 1] ?? '';
    let typeText = parts.slice(1, -1).join(' ');
    // Live titles sometimes put the type last (`FLINT - EATON - HVAC REPLACEMENT`); then the middle is the name.
    if (readsAsType(lastName) && !readsAsType(typeText)) [lastName, typeText] = [typeText, lastName];
    return { city: parts[0] ?? '', lastName, typeText };
  }
  if (parts.length === 2) return { city: parts[0] ?? '', lastName: clientLast, typeText: parts[1] ?? '' };
  return { city: input.propertyCity ?? '', lastName: clientLast, typeText: parts[0] ?? '' };
}

/** The wall label `LASTNAME · CITY · SCOPE` (decision 4). Blank name or city shows as '—'. */
export function makeLabel(lastName: string, city: string, scope: Scope): string {
  const name = cleanName(lastName) || DASH;
  const town = shortCity(city) || DASH;
  return `${name} · ${town} · ${scope}`;
}

/** Parses a Jobber job title (plus client / property fallbacks) into what the wall may show. */
export function parseTitle(input: TitleInput): TitleParse {
  const parts = splitTitle(input.title ?? '');
  const raw = assignParts(parts, input);
  const token = findToken(raw.typeText);
  const typeWord = typeWordOf(raw.typeText, token);
  const program = programFor(token);
  const scope = scopeFor({ typeText: raw.typeText, typeWord, instructions: input.instructions ?? '', program });
  const lastName = cleanName(raw.lastName);
  const city = shortCity(raw.city);
  const out: TitleParse = { lastName, city, scope, program, label: makeLabel(lastName, city, scope) };
  if (token !== undefined) out.token = token;
  if (typeWord !== '') out.typeWord = typeWord;
  return out;
}
