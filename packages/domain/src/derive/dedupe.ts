/**
 * Idempotent writes (decisions 1, 5, 8, 11, 12). Every write the board makes lands in Jobber or a
 * Google Sheet, so a double tap, a retried request or a replayed queue must never create a second
 * row or note. Each write gets a content-derived `submissionId`; review taps are also collapsed by
 * time; a crew recap may be re-done only while it is still queued. Pure functions, no I/O, and the
 * SHA-256 is self-contained because this package also runs in the browser (no node:crypto).
 */
import { CONFIG } from '../config.js';
import type { Instant } from '../types.js';
import { minutesBetween } from './time.js';

// ---------- SHA-256 (FIPS 180-4), pure JS over UTF-8 bytes ----------

/** First 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** First 32 bits of the fractional parts of the square roots of the first 8 primes. */
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_BYTES = 64;

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** Message + 0x80 + zero pad + 64-bit big-endian bit length, as a whole number of 64-byte blocks. */
function padMessage(bytes: Uint8Array): DataView {
  const padded = Math.ceil((bytes.length + 9) / BLOCK_BYTES) * BLOCK_BYTES;
  const buf = new Uint8Array(padded);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  const bitLen = bytes.length * 8;
  view.setUint32(padded - 8, Math.floor(bitLen / 0x1_0000_0000), false);
  view.setUint32(padded - 4, bitLen >>> 0, false);
  return view;
}

/** Self-contained SHA-256 over the UTF-8 encoding of `input`, as 64 lowercase hex characters. */
export function sha256Hex(input: string): string {
  const view = padMessage(new TextEncoder().encode(input));
  const H = new Uint32Array(H0);
  const W = new Uint32Array(64);

  // Index reads below are provably in range; `!` only satisfies noUncheckedIndexedAccess.
  for (let off = 0; off < view.byteLength; off += BLOCK_BYTES) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15]!;
      const w2 = W[i - 2]!;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }

    let a = H[0]!;
    let b = H[1]!;
    let c = H[2]!;
    let d = H[3]!;
    let e = H[4]!;
    let f = H[5]!;
    let g = H[6]!;
    let h = H[7]!;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + W[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }

  return Array.from(H, (word) => word.toString(16).padStart(8, '0')).join('');
}

// ---------- Stable JSON ----------

/** Rebuilds plain objects with their keys sorted, recursively; arrays keep their order. */
function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v !== null && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortKeysDeep(src[key]);
    return out;
  }
  return v;
}

/** JSON.stringify with object keys sorted at every depth, so equal payloads give equal text. */
export function stableJson(v: unknown): string {
  const text: string | undefined = JSON.stringify(sortKeysDeep(v));
  return text ?? 'null';
}

// ---------- Submission ids ----------

/**
 * Decisions 1, 8, 11: a write is identified by what it says, not when it was tapped, so a retry or a
 * replayed queue carries the same id. sha256(`kind|targetId|pass|stableJson(payload)`).
 */
export function submissionId(kind: string, targetId: string, pass: number | undefined, payload: unknown): string {
  return sha256Hex(`${kind}|${targetId}|${pass ?? ''}|${stableJson(payload)}`);
}

// ---------- Review tap dedupe ----------

export interface ReviewTap {
  targetId: string;
  pass?: number;
  reviewerUserId?: string;
  verdict?: string;
  at: Instant;
}

/** Decision 5: the same reviewer giving the same verdict on the same target and pass is the same tap. */
function sameTap(a: ReviewTap, b: ReviewTap): boolean {
  return (
    a.targetId === b.targetId && a.pass === b.pass && a.reviewerUserId === b.reviewerUserId && a.verdict === b.verdict
  );
}

/**
 * Decisions 5, 8: two identical review taps within REVIEW_DEDUPE_MIN minutes (either direction,
 * boundary inclusive) are one tap, so the second never appends a second sheet row.
 */
export function shouldDropReview(existing: ReviewTap[], incoming: ReviewTap): boolean {
  return existing.some(
    (prior) => sameTap(prior, incoming) && Math.abs(minutesBetween(prior.at, incoming.at)) <= CONFIG.REVIEW_DEDUPE_MIN,
  );
}

// ---------- Recap decisions ----------

export type RecapDecision = 'accept' | 'supersede' | 'refuse';

/**
 * Decisions 11, 12: one recap per visit. A first recap is accepted; a repeat while the earlier one
 * is still queued replaces it; once the earlier one is flushed to Jobber the repeat is refused
 * ("already in Jobber") because the note is now Jobber's record.
 */
export function recapDecision(
  existing: { visitId: string; flushed: boolean } | undefined,
  incoming: { visitId: string },
): RecapDecision {
  if (!existing || existing.visitId !== incoming.visitId) return 'accept';
  return existing.flushed ? 'refuse' : 'supersede';
}
