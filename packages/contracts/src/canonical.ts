import { createHash } from "node:crypto";

/**
 * Canonical JSON and the action digest.
 *
 * Canonical form: object keys sorted by UTF-16 code unit, no insignificant whitespace, strings and finite numbers
 * only as JSON.stringify writes them. Anything JSON cannot represent (undefined, bigint, functions, symbols,
 * non-finite numbers, class instances) throws rather than being silently dropped, because a silently dropped field
 * would let two different payloads share a digest.
 */

const MAX_DEPTH = 16;

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) throw new TypeError("canonicalJson: nesting too deep");
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v, depth + 1)).join(",")}]`;
      }
      if (!isPlainObject(value)) throw new TypeError("canonicalJson: unsupported object type");
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys
        .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k], depth + 1)}`)
        .join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`);
  }
}

/** Bumping this changes every digest; only do it with a migration plan for open requests. */
export const DIGEST_VERSION = 1;

export interface DigestInput {
  action: string;
  resource: string;
  environmentId: string;
  parameters: Readonly<Record<string, unknown>>;
}

/**
 * SHA-256 (hex) over the canonical JSON of `{v, action, resource, environment_id, parameters}`. The tenant and the
 * agent are bound by the request and grant rows (composite foreign keys), not by the digest. The digest is what an
 * approval and a grant refer to, and the executor recomputes it from the stored parameters before it acts.
 */
export function computeActionDigest(input: DigestInput): string {
  const canonical = canonicalJson({
    v: DIGEST_VERSION,
    action: input.action,
    resource: input.resource,
    environment_id: input.environmentId,
    parameters: input.parameters,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
