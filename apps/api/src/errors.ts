/**
 * Domain errors raised by the management operations. Anything that is NOT one of these (a lost connection, a
 * timeout, a bug) is treated as an infrastructure failure and fails closed.
 */
export type DomainErrorCode =
  "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID" | "STEP_UP" | "EXPIRED";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: DomainErrorCode,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const unauthenticated = (message = "not signed in") =>
  new DomainError(message, "UNAUTHENTICATED");
export const forbidden = (message = "not permitted") => new DomainError(message, "FORBIDDEN");
export const notFound = (message = "not found") => new DomainError(message, "NOT_FOUND");
export const conflict = (message: string) => new DomainError(message, "CONFLICT");
export const invalid = (message: string) => new DomainError(message, "INVALID");
export const stepUpRequired = () =>
  new DomainError("a recent multi-factor authentication is required", "STEP_UP");
export const expired = (message = "expired") => new DomainError(message, "EXPIRED");

interface PgLikeError {
  code?: unknown;
  message?: unknown;
}

const hasCode = (error: unknown): error is PgLikeError =>
  typeof error === "object" && error !== null && "code" in error;

/**
 * Translate a PostgreSQL error raised during a management operation into a domain error. Unknown errors are returned
 * unchanged so the caller can fail closed.
 */
export function translateDbError(error: unknown): unknown {
  if (error instanceof DomainError || !hasCode(error)) return error;
  switch (error.code) {
    case "22P02": // invalid_text_representation (a malformed uuid, for example)
    case "22023": // invalid_parameter_value
      return invalid("malformed value");
    case "42501": // insufficient_privilege (RLS violation, role check, append-only guard)
      return forbidden();
    case "AX001": // a recent multi-factor authentication is required
      return stepUpRequired();
    case "AX002": // organization limit
      return conflict("organization limit reached");
    case "AX003": // last owner
      return conflict("an organization needs at least one owner");
    case "P0002": // no_data_found raised by a database function
      return notFound();
    case "23505": // unique_violation
      return conflict("already exists");
    case "23503": // foreign_key_violation
      return notFound("referenced record not found");
    case "23514": // check_violation (state-machine and policy-version guards)
      return conflict(typeof error.message === "string" ? error.message : "constraint violated");
    default:
      return error;
  }
}
