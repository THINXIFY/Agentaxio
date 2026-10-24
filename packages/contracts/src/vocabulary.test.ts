import { describe, expect, it } from "vitest";
import {
  ACTION_REQUEST_STATUSES,
  ERROR_CODES,
  INITIAL_STATUSES,
  POLICY_EFFECTS,
  REASON_CODES,
  TERMINAL_STATUSES,
  allTransitions,
  canTransition,
  isTerminal,
  type ActionRequestStatus,
} from "./index";

describe("vocabulary", () => {
  it("statuses match docs/N8N-ENFORCEMENT.md exactly", () => {
    expect([...ACTION_REQUEST_STATUSES]).toEqual([
      "denied",
      "pending_approval",
      "approved",
      "queued_execution",
      "running",
      "succeeded",
      "failed",
      "expired",
      "unknown",
    ]);
  });

  it("policy effects are exactly deny, require_approval, allow", () => {
    expect([...POLICY_EFFECTS]).toEqual(["deny", "require_approval", "allow"]);
  });

  it("has no duplicate codes", () => {
    for (const list of [ACTION_REQUEST_STATUSES, REASON_CODES, ERROR_CODES]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe("request state machine", () => {
  const all = [...ACTION_REQUEST_STATUSES];

  it("never leaves a terminal state", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      ["denied", "expired", "failed", "succeeded", "unknown"].sort(),
    );
    for (const from of TERMINAL_STATUSES) {
      for (const to of all) expect(canTransition(from, to)).toBe(false);
      expect(isTerminal(from)).toBe(true);
    }
  });

  it("never reports `approved` as executed: succeeded/failed/unknown are reachable only from running", () => {
    for (const from of all.filter((s) => s !== "running")) {
      for (const to of ["succeeded", "failed", "unknown"] as const) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
      }
    }
    expect(canTransition("approved", "running")).toBe(false);
    expect(canTransition("pending_approval", "running")).toBe(false);
  });

  it("reaches running only from queued_execution", () => {
    for (const from of all)
      expect(canTransition(from, "running")).toBe(from === "queued_execution");
  });

  it("allows the intended happy path and nothing skips a stage", () => {
    const path: ActionRequestStatus[] = [
      "pending_approval",
      "approved",
      "queued_execution",
      "running",
      "succeeded",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      const [from, to] = [path[i], path[i + 1]];
      expect(from !== undefined && to !== undefined && canTransition(from, to)).toBe(true);
    }
    expect(canTransition("pending_approval", "queued_execution")).toBe(false);
    expect(canTransition("pending_approval", "succeeded")).toBe(false);
  });

  it("cannot return to an earlier state", () => {
    expect(canTransition("approved", "pending_approval")).toBe(false);
    expect(canTransition("queued_execution", "approved")).toBe(false);
    expect(canTransition("running", "queued_execution")).toBe(false);
  });

  it("allows a stricter outcome (denied/expired) before execution starts, never during it", () => {
    for (const from of ["pending_approval", "approved", "queued_execution"] as const) {
      expect(canTransition(from, "denied")).toBe(true);
      expect(canTransition(from, "expired")).toBe(true);
    }
    expect(canTransition("running", "denied")).toBe(false);
    expect(canTransition("running", "expired")).toBe(false);
  });

  it("a request can only be created denied, pending_approval or approved", () => {
    expect([...INITIAL_STATUSES]).toEqual(["denied", "pending_approval", "approved"]);
  });

  it("lists every legal pair exactly once", () => {
    const pairs = allTransitions().map(([a, b]) => `${a}>${b}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const [a, b] of allTransitions()) expect(canTransition(a, b)).toBe(true);
  });
});
