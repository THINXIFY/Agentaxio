import { describe, expect, it } from "vitest";
import { ACTION_KEYS, ACTION_REQUEST_STATUSES } from "@/lib/contracts";
import { countByStatus, listMockActionRequests, listMockAgents, traceFor } from "@/mocks";

describe("mock data guardrails", () => {
  it("clearly identifies every record as mock", () => {
    for (const agent of listMockAgents()) expect(agent.id).toMatch(/^mock_/);
    for (const req of listMockActionRequests()) expect(req.id).toMatch(/^mock_/);
  });

  it("only uses actions from the locked Phase 1 contract (no refunds or payments)", () => {
    for (const req of listMockActionRequests()) expect(ACTION_KEYS).toContain(req.action);
  });

  it("uses exactly the strict crm.lead.create schema keys and reserved .test emails", () => {
    for (const req of listMockActionRequests()) {
      expect(Object.keys(req.parameters).sort()).toEqual(["company", "email", "full_name"]);
      expect(req.parameters.email).toMatch(/@example\.test$/);
    }
  });

  it("references agents that exist", () => {
    const ids = new Set(listMockAgents().map((a) => a.id));
    for (const req of listMockActionRequests()) expect(ids.has(req.agentId)).toBe(true);
  });

  it("counts every contract status", () => {
    const counts = countByStatus(listMockActionRequests());
    expect(Object.keys(counts).sort()).toEqual([...ACTION_REQUEST_STATUSES].sort());
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(listMockActionRequests().length);
  });
});

describe("traceFor", () => {
  it("always returns the five steps in order", () => {
    for (const req of listMockActionRequests()) {
      expect(traceFor(req).map((s) => s.id)).toEqual([
        "identity",
        "policy",
        "review",
        "executor",
        "record",
      ]);
    }
  });

  it("never reaches the executor for a denied or expired request", () => {
    for (const status of ["denied", "expired"] as const) {
      const req = listMockActionRequests().find((r) => r.status === status)!;
      const executor = traceFor(req).find((s) => s.id === "executor")!;
      expect(executor.state).toBe("skipped");
    }
  });

  it("keeps a pending request waiting for review with nothing executed", () => {
    const req = listMockActionRequests().find((r) => r.status === "pending_approval")!;
    const steps = Object.fromEntries(traceFor(req).map((s) => [s.id, s.state]));
    expect(steps.review).toBe("current");
    expect(steps.executor).toBe("waiting");
  });

  it("marks an unknown outcome as uncertain, not as success", () => {
    const req = listMockActionRequests().find((r) => r.status === "unknown")!;
    expect(traceFor(req).find((s) => s.id === "executor")!.state).toBe("uncertain");
  });

  it("only shows the executor as done for a succeeded request", () => {
    const done = ACTION_REQUEST_STATUSES.filter((status) => {
      const base = listMockActionRequests()[0]!;
      return traceFor({ ...base, status }).find((s) => s.id === "executor")!.state === "done";
    });
    expect(done).toEqual(["succeeded"]);
  });
});
