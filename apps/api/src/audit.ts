import type { Tx } from "./db/pool";

/**
 * Append an audit event inside the caller's transaction. Because it shares the transaction with the state change it
 * describes, there is never a state change without its record, and if this insert fails the whole operation fails
 * (fail closed).
 *
 * Metadata is deliberately restricted to short scalar values and arrays of them (ids, field NAMES, reason codes,
 * versions, digests). Nested objects and long strings are refused, so request parameters (personal data) and secrets
 * cannot be copied into the audit trail by accident.
 */

export type AuditScalar = string | number | boolean | null;
export type AuditMetadata = Record<string, AuditScalar | AuditScalar[]>;

export interface AuditEvent {
  organizationId: string;
  actorType: "agent" | "user" | "system";
  actorId: string | null;
  eventType: string;
  objectType: string;
  objectId?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  metadata?: AuditMetadata;
}

const MAX_VALUE_LENGTH = 200;
const MAX_ARRAY_LENGTH = 25;

function assertScalar(value: unknown): asserts value is AuditScalar {
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string" && value.length <= MAX_VALUE_LENGTH) return;
  throw new TypeError("audit metadata values must be short scalars");
}

export function assertSafeMetadata(metadata: AuditMetadata): void {
  for (const value of Object.values(metadata as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) throw new TypeError("audit metadata array too long");
      value.forEach(assertScalar);
    } else {
      assertScalar(value);
    }
  }
}

export async function recordAudit(tx: Tx, event: AuditEvent): Promise<void> {
  const metadata = event.metadata ?? {};
  assertSafeMetadata(metadata);
  await tx.query(
    `INSERT INTO axo.audit_events
       (organization_id, actor_type, actor_id, event_type, object_type, object_id, request_id, trace_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      event.organizationId,
      event.actorType,
      event.actorId,
      event.eventType,
      event.objectType,
      event.objectId ?? null,
      event.requestId ?? null,
      event.traceId ?? null,
      JSON.stringify(metadata),
    ],
  );
}
