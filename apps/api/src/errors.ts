/**
 * Domain errors raised by the management operations. Anything that is NOT one of these (a lost connection, a
 * timeout, a bug) is treated as an infrastructure failure and fails closed.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const forbidden = (message = "not permitted") => new DomainError(message, "FORBIDDEN");
export const notFound = (message = "not found") => new DomainError(message, "NOT_FOUND");
export const conflict = (message: string) => new DomainError(message, "CONFLICT");
export const invalid = (message: string) => new DomainError(message, "INVALID");

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
      return invalid("malformed value");
    case "42501": // insufficient_privilege (RLS violation, role check, append-only guard)
      return forbidden();
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
