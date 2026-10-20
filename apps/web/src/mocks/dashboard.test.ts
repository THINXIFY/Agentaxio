import { describe, expect, it } from "vitest";
import { ACTION_KEYS, ACTION_REQUEST_STATUSES } from "@/lib/contracts";
import { listMockActionRequests, listMockAgents } from "@/mocks";
import {
  activityByDay,
  approvalCenterRequests,
  countStatuses,
  decisionBreakdown,
  formatAgo,
  lifecycleFor,
  listDashboardAgents,
  listDashboardRequests,
  pendingApprovals,
} from "@/mocks/dashboard";

describe("dashboard mock dataset integrity", () => {
  const agents = listDashboardAgents();
  const requests = listDashboardRequests();

  it("leaves the base datasets the marketing homepage depends on untouched", () => {
    expect(listMockAgents()).toHaveLength(3);
    expect(listMockActionRequests()).toHaveLength(6);
  });

  it("marks every record as mock and uses only reserved example data", () => {
    for (const a of agents) expect(a.id).toMatch(/^mock_/);
    for (const r of requests) {
      expect(r.id).toMatch(/^mock_/);
      expect(r.parameters.email).toMatch(/@example\.test$/);
      expect(Object.keys(r.parameters).sort()).toEqual(["company", "email", "full_name"]);
      expect(ACTION_KEYS).toContain(r.action);
    }
  });

  it("has unique ids and valid cross references", () => {
    expect(new Set(agents.map((a) => a.id)).size).toBe(agents.length);
    expect(new Set(requests.map((r) => r.id)).size).toBe(requests.length);
    const ids = new Set(agents.map((a) => a.id));
    for (const r of requests) expect(ids.has(r.agentId), r.id).toBe(true);
  });

  it("covers every lifecycle-relevant status so each state can be displayed", () => {
    const seen = new Set(requests.map((r) => r.status));
    for (const s of [
      "denied",
      "pending_approval",
      "approved",
      "queued_execution",
      "running",
      "succeeded",
      "failed",
      "expired",
      "unknown",
    ] as const) {
      expect(seen.has(s), s).toBe(true);
    }
  });

  it("derives lastRequestAt from the newest request per agent", () => {
    for (const a of agents) {
      const newest = requests.find((r) => r.agentId === a.id)?.createdAt ?? null;
      expect(a.lastRequestAt).toBe(newest);
    }
  });

  it("gives suspended agents a deny rule, and never a standing allow", () => {
    for (const a of agents.filter((x) => x.status === "suspended")) {
      expect(a.permissions.every((p) => p.effect === "deny")).toBe(true);
    }
  });

  it("returns requests newest first", () => {
    const times = requests.map((r) => r.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe("aggregates", () => {
  const requests = listDashboardRequests();

  it("counts every contract status and totals to the number of requests", () => {
    const counts = countStatuses(requests);
    expect(Object.keys(counts).sort()).toEqual([...ACTION_REQUEST_STATUSES].sort());
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(requests.length);
  });

  it("splits decisions without conflating them with execution outcomes", () => {
    const d = decisionBreakdown(requests);
    expect(d.allowed + d.pending + d.denied + d.expired).toBe(requests.length);
    expect(d.pending).toBe(pendingApprovals().length);
  });

  it("buckets activity by UTC day over the window and accounts for every request", () => {
    const days = activityByDay(requests, 4);
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
    ]);
    expect(days.reduce((s, d) => s + d.count, 0)).toBe(requests.length);
  });

  it("approval centre only lists requests that involve a reviewer", () => {
    for (const r of approvalCenterRequests()) expect(r.reviewRequired).toBe(true);
  });

  it("formats sample-relative times", () => {
    expect(formatAgo("2026-10-20T09:59:30Z")).toBe("1 min ago");
    expect(formatAgo("2026-10-20T09:31:00Z")).toBe("29 min ago");
    expect(formatAgo("2026-10-20T07:40:00Z")).toBe("2 h ago");
    expect(formatAgo("2026-10-17T14:03:00Z")).toBe("2 d ago");
  });
});

describe("lifecycleFor: authorization, approval and execution stay separate", () => {
  const base = { reviewRequired: true } as const;

  it("always returns the three stages in order", () => {
    for (const status of ACTION_REQUEST_STATUSES) {
      expect(lifecycleFor({ status, ...base }).map((s) => s.key)).toEqual([
        "authorization",
        "approval",
        "execution",
      ]);
    }
  });

  it("only a succeeded request has a completed execution stage", () => {
    const done = ACTION_REQUEST_STATUSES.filter(
      (status) =>
        lifecycleFor({ status, ...base }).find((s) => s.key === "execution")!.state === "done",
    );
    expect(done).toEqual(["succeeded"]);
  });

  it("never treats approval as proof of execution", () => {
    const stages = lifecycleFor({ status: "approved", ...base });
    expect(stages.find((s) => s.key === "approval")).toMatchObject({
      label: "Approval granted",
      state: "done",
    });
    expect(stages.find((s) => s.key === "execution")).toMatchObject({
      label: "Execution pending",
      state: "pending",
    });
  });

  it("uses the seven distinctions the product needs", () => {
    const labels = new Set<string>();
    for (const status of ACTION_REQUEST_STATUSES) {
      for (const reviewRequired of [true, false]) {
        for (const s of lifecycleFor({ status, reviewRequired })) labels.add(s.label);
      }
    }
    for (const expected of [
      "Authorization allowed",
      "Approval requested",
      "Approval granted",
      "Execution pending",
      "Execution completed",
      "Execution failed",
      "Authorization denied",
    ]) {
      expect(labels.has(expected), expected).toBe(true);
    }
  });

  it("stops at authorization for a denied request", () => {
    const [auth, approval, exec] = lifecycleFor({ status: "denied", reviewRequired: false });
    expect(auth).toMatchObject({ state: "stopped", label: "Authorization denied" });
    expect(approval!.state).toBe("na");
    expect(exec!.state).toBe("na");
  });

  it("marks an unknown outcome as uncertain, not as success or failure", () => {
    const exec = lifecycleFor({ status: "unknown", reviewRequired: false }).find(
      (s) => s.key === "execution",
    )!;
    expect(exec.state).toBe("uncertain");
  });

  it("does not claim approval for an expired request", () => {
    const approval = lifecycleFor({ status: "expired", ...base }).find(
      (s) => s.key === "approval",
    )!;
    expect(approval).toMatchObject({ label: "Approval expired", state: "stopped" });
  });
});
