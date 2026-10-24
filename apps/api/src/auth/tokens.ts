import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque random tokens for sessions, CSRF protection, invitations and browser binding. Each is 256 bits from the
 * operating system's CSPRNG. Only the SHA-256 of a token is ever stored: a database copy cannot be replayed as a
 * cookie. (A fast hash is correct here; these are high-entropy secrets, not passwords.)
 */

export interface Token {
  /** Shown to its holder once (cookie, header, invitation link). Never stored or logged. */
  value: string;
  hash: Buffer;
}

export const hashToken = (value: string): Buffer =>
  createHash("sha256").update(value, "utf8").digest();

export function newToken(): Token {
  const value = randomBytes(32).toString("base64url");
  return { value, hash: hashToken(value) };
}

/** A well-formed token is exactly 43 base64url characters; anything else is rejected before it is hashed or looked up. */
export const isWellFormedToken = (value: string | undefined): value is string =>
  value !== undefined && /^[A-Za-z0-9_-]{43}$/.test(value);

export function tokensEqual(presented: string | undefined, storedHash: Buffer): boolean {
  if (!isWellFormedToken(presented)) return false;
  const candidate = hashToken(presented);
  return candidate.length === storedHash.length && timingSafeEqual(candidate, storedHash);
}
