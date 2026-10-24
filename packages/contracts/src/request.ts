import { z } from "zod";
import {
  ACTION_CATALOG,
  ACTION_KEY_MAX_LENGTH,
  ACTION_KEY_PATTERN,
  isActionKey,
  type ActionKey,
} from "./actions";

/**
 * Validation of `POST /v1/action-requests` bodies. The body carries ONLY `action`, `resource` and `parameters`:
 * tenant, agent, environment and credentials are derived from the authenticated key and are not accepted here (an
 * attempt to send them is an unknown key and is rejected).
 *
 * Outcomes map to the HTTP layer as follows (docs/BE-01A-ARCHITECTURE-REVIEW.md, C6):
 *  - `invalid`        -> 422 INVALID_REQUEST, no request row, an audit event without the payload;
 *  - `unknown_action` -> a recorded `denied` / UNKNOWN_ACTION decision.
 */

const envelope = z.strictObject({
  action: z.string().max(ACTION_KEY_MAX_LENGTH),
  resource: z.string().max(128),
  parameters: z.custom<Record<string, unknown>>(isPlainRecord),
});

/**
 * Only plain objects (as JSON.parse produces) are accepted, never class instances, Maps or objects that inherit
 * properties from a custom prototype: an inherited value would be read as if the caller had sent it.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

export interface ValidatedActionRequest {
  action: ActionKey;
  resource: string;
  /** Normalized parameters: trimmed, NFC, email lowercased. This is exactly what is digested, reviewed and executed. */
  parameters: Readonly<Record<string, string>>;
}

export type ActionRequestValidation =
  | { ok: true; request: ValidatedActionRequest }
  | { ok: false; kind: "invalid"; issues: readonly string[] }
  | { ok: false; kind: "unknown_action"; action: string };

/** Issue summaries carry a path and a code only, never a value, so personal data cannot leak into logs or audit. */
function summarize(error: z.ZodError, prefix = ""): string[] {
  return error.issues.map((i) => `${prefix}${i.path.join(".") || "(root)"}: ${i.code}`);
}

/** Never throws: anything that cannot be validated (including hostile objects) is simply invalid. */
export function validateActionRequest(input: unknown): ActionRequestValidation {
  try {
    return validate(input);
  } catch {
    return { ok: false, kind: "invalid", issues: ["(root): validation_error"] };
  }
}

function validate(input: unknown): ActionRequestValidation {
  if (!isPlainRecord(input))
    return { ok: false, kind: "invalid", issues: ["(root): invalid_type"] };
  const parsed = envelope.safeParse(input);
  if (!parsed.success) return { ok: false, kind: "invalid", issues: summarize(parsed.error) };

  const { action, resource, parameters } = parsed.data;
  if (!ACTION_KEY_PATTERN.test(action)) {
    return { ok: false, kind: "invalid", issues: ["action: invalid_format"] };
  }
  if (!isActionKey(action)) return { ok: false, kind: "unknown_action", action };

  const definition = ACTION_CATALOG[action];
  if (resource !== definition.resource) {
    return { ok: false, kind: "invalid", issues: ["resource: not_canonical_for_action"] };
  }

  const checked = definition.parameters.safeParse(parameters);
  if (!checked.success) {
    return { ok: false, kind: "invalid", issues: summarize(checked.error, "parameters.") };
  }
  return {
    ok: true,
    request: { action, resource, parameters: checked.data },
  };
}
