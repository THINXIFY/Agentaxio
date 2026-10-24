import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Agent credential format:  axo_<keyId>_<secret>
 *   keyId   24 hex characters, a public lookup handle (stored in clear, proves nothing by itself)
 *   secret  43 base64url characters = 256 random bits
 *
 * Only HMAC-SHA-256(pepper, secret) is stored. The secret has 256 bits of entropy, so a fast keyed hash is the right
 * tool: a slow password hash would add nothing but a per-request CPU cost that an attacker could exploit. The pepper
 * lives only in the service environment, so a stolen database alone cannot be used to test guesses.
 */

const KEY_PATTERN = /^axo_([0-9a-f]{24})_([A-Za-z0-9_-]{43})$/;
export const MAX_CREDENTIAL_LENGTH = 80;
export const HASH_VERSION = 1;

export interface GeneratedCredential {
  keyId: string;
  /** The full presentable key. Shown to the operator once and never stored or logged. */
  fullKey: string;
  secretHash: Buffer;
  hashVersion: number;
}

export function generateCredential(pepper: Buffer): GeneratedCredential {
  const keyId = randomBytes(12).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return {
    keyId,
    fullKey: `axo_${keyId}_${secret}`,
    secretHash: hashSecret(pepper, secret),
    hashVersion: HASH_VERSION,
  };
}

export function hashSecret(pepper: Buffer, secret: string): Buffer {
  return createHmac("sha256", pepper).update(secret, "utf8").digest();
}

export interface ParsedCredential {
  keyId: string;
  secret: string;
}

export function parseCredential(presented: string): ParsedCredential | null {
  if (presented.length > MAX_CREDENTIAL_LENGTH) return null;
  const match = KEY_PATTERN.exec(presented);
  if (match === null) return null;
  const [, keyId, secret] = match;
  return keyId !== undefined && secret !== undefined ? { keyId, secret } : null;
}

/** Constant-time comparison of the presented secret against the stored digest. */
export function verifySecret(pepper: Buffer, secret: string, stored: Buffer): boolean {
  const candidate = hashSecret(pepper, secret);
  return stored.length === candidate.length && timingSafeEqual(candidate, stored);
}

/**
 * Do the same amount of hashing work for a credential that does not exist, so response time does not reveal
 * whether a key id is real.
 */
export function burnVerification(pepper: Buffer, secret: string): false {
  verifySecret(pepper, secret, Buffer.alloc(32));
  return false;
}

/** Extract the key from `Authorization: Bearer <key>`. Anything but exactly that shape is rejected. */
export function bearerFromHeader(header: string | undefined): string | null {
  if (header === undefined || header.length > MAX_CREDENTIAL_LENGTH + 7) return null;
  const match = /^Bearer ([!-~]+)$/.exec(header);
  return match?.[1] ?? null;
}
