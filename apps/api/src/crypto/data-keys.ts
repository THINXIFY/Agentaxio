import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level envelope encryption for sensitive request data (docs/BE-02-DECISIONS.md D9).
 *
 * AES-256-GCM with a fresh random 96-bit nonce per message. The "additional authenticated data" binds each ciphertext
 * to the row it belongs to (organization + request + digest), so a ciphertext copied to another row or another
 * tenant fails to decrypt instead of being read. Keys are versioned: any key in the ring can decrypt, only the current
 * one encrypts, so rotation is "add a key, make it current".
 *
 * Where the ring comes from is a deployment decision (a key-management service); this module only needs the keys
 * delivered to the process. It never logs, returns or persists key material.
 *
 * Format: 0x01 | nonce(12) | ciphertext | tag(16)
 */

const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID = /^[a-z0-9_-]{1,32}$/;

export class KeyError extends Error {}

export interface KeyRing {
  readonly currentKeyId: string;
  readonly keys: ReadonlyMap<string, Buffer>;
}

/** `keysJson` is {"<key id>": "<32 random bytes, base64url>"}; `currentKeyId` names the key used to encrypt. */
export function parseKeyRing(
  keysJson: string | undefined,
  currentKeyId: string | undefined,
): KeyRing {
  if (keysJson === undefined || keysJson.trim() === "")
    throw new KeyError("AXO_DATA_KEYS is not set");
  if (currentKeyId === undefined || !KEY_ID.test(currentKeyId)) {
    throw new KeyError("AXO_DATA_KEY_ID is not set or is malformed");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(keysJson);
  } catch {
    throw new KeyError("AXO_DATA_KEYS is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new KeyError("AXO_DATA_KEYS must be an object of key id to key");
  }
  const keys = new Map<string, Buffer>();
  for (const [id, value] of Object.entries(parsed)) {
    if (!KEY_ID.test(id) || typeof value !== "string") {
      throw new KeyError("AXO_DATA_KEYS has a malformed entry");
    }
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length !== 32) throw new KeyError(`data key ${id} must be exactly 32 bytes`);
    if (new Set(bytes).size < 8) throw new KeyError(`data key ${id} does not look random`);
    keys.set(id, bytes);
  }
  if (!keys.has(currentKeyId))
    throw new KeyError("AXO_DATA_KEY_ID does not name a key in AXO_DATA_KEYS");
  return { currentKeyId, keys };
}

export function encryptJson(
  ring: KeyRing,
  value: unknown,
  aad: string,
): { ciphertext: Buffer; keyId: string } {
  const key = ring.keys.get(ring.currentKeyId);
  if (key === undefined) throw new KeyError("current data key missing");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    ciphertext: Buffer.concat([Buffer.from([VERSION]), nonce, body, cipher.getAuthTag()]),
    keyId: ring.currentKeyId,
  };
}

/** Throws KeyError on a wrong key, wrong row (aad), truncated or tampered data: it never returns partial plaintext. */
export function decryptJson(
  ring: KeyRing,
  ciphertext: Buffer,
  keyId: string,
  aad: string,
): unknown {
  const key = ring.keys.get(keyId);
  if (key === undefined) throw new KeyError("unknown data key");
  if (ciphertext.length < 1 + NONCE_BYTES + TAG_BYTES || ciphertext[0] !== VERSION) {
    throw new KeyError("malformed ciphertext");
  }
  const nonce = ciphertext.subarray(1, 1 + NONCE_BYTES);
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
  const body = ciphertext.subarray(1 + NONCE_BYTES, ciphertext.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new KeyError("decryption failed");
  }
}

/** The additional authenticated data for a request's parameters. */
export const parametersAad = (organizationId: string, requestId: string, digest: string): string =>
  `params|${organizationId}|${requestId}|${digest}`;
