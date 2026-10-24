import type { ActionRequestStatus } from "./vocabulary";

/**
 * The request state machine (docs/BE-01A-ARCHITECTURE-REVIEW.md section 4.3). The database repeats these pairs in a
 * CHECK so a bug here cannot create an illegal state. Two properties matter most:
 *  - nothing leaves a terminal state;
 *  - the only way to `succeeded`, `failed` or `unknown` is through `running`, and the only way to `running` is
 *    through `queued_execution`, so `approved` can never be reported as executed.
 */
const TRANSITIONS: Readonly<Record<ActionRequestStatus, readonly ActionRequestStatus[]>> = {
  pending_approval: ["approved", "denied", "expired"],
  approved: ["queued_execution", "denied", "expired"],
  queued_execution: ["running", "denied", "expired"],
  running: ["succeeded", "failed", "unknown"],
  denied: [],
  expired: [],
  succeeded: [],
  failed: [],
  unknown: [],
};

/** A request is created in one of these states, decided by the first policy evaluation. */
export const INITIAL_STATUSES = [
  "denied",
  "pending_approval",
  "approved",
] as const satisfies readonly ActionRequestStatus[];

export const TERMINAL_STATUSES = (Object.keys(TRANSITIONS) as ActionRequestStatus[]).filter(
  (s) => TRANSITIONS[s].length === 0,
);

/**
 * Statuses arrive from the database as plain strings, so look them up as own properties only: "constructor" or
 * "toString" must not resolve to a function on the prototype. An unrecognised status has no successors, which makes
 * every transition from it illegal and treats it as terminal (fail closed).
 */
function successors(status: string): readonly string[] {
  return Object.hasOwn(TRANSITIONS, status) ? TRANSITIONS[status as ActionRequestStatus] : [];
}

export function canTransition(from: ActionRequestStatus, to: ActionRequestStatus): boolean {
  return successors(from).includes(to);
}

export function isTerminal(status: ActionRequestStatus): boolean {
  return successors(status).length === 0;
}

/** Every legal (from, to) pair, for generating the database CHECK constraint and for tests. */
export function allTransitions(): ReadonlyArray<
  readonly [ActionRequestStatus, ActionRequestStatus]
> {
  return (Object.keys(TRANSITIONS) as ActionRequestStatus[]).flatMap((from) =>
    TRANSITIONS[from].map((to) => [from, to] as const),
  );
}
