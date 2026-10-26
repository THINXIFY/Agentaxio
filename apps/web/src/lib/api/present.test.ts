import { describe, expect, it } from "vitest";
import { ACTION_REQUEST_STATUSES } from "@/lib/contracts";
import {
  conditionsText,
  eventLabel,
  liveLifecycle,
  reasonText,
  relativeTime,
  timeLeft,
  toRequestStatus,
} from "./present";

const NOW = Date.parse("2026-10-24T12:00:00Z");

describe("live record presentation", () => {
  it("narrows statuses and never invents one", () => {
    expect(toRequestStatus("succeeded")).toBe("succeeded");
    expect(toRequestStatus("approved")).toBe("approved");
    expect(toRequestStatus("something_new")).toBe("unknown");
  });

  it("describes times without ever rounding an expired deadline into the future", () => {
    expect(relativeTime("2026-10-24T11:59:40Z", NOW)).toBe("just now");
    expect(relativeTime("2026-10-24T11:30:00Z", NOW)).toBe("30 min ago");
    expect(relativeTime("2026-10-24T09:00:00Z", NOW)).toBe("3 h ago");
    expect(relativeTime("2026-10-21T12:00:00Z", NOW)).toBe("3 d ago");
    expect(timeLeft("2026-10-24T12:10:00Z", NOW)).toBe("10 min left");
    expect(timeLeft("2026-10-24T12:00:30Z", NOW)).toBe("under a minute left");
    expect(timeLeft("2026-10-24T12:00:00Z", NOW)).toBe("expired");
    expect(timeLeft("2026-10-24T11:00:00Z", NOW)).toBe("expired");
  });

  it("explains reason codes in plain words and has a safe fallback", () => {
    expect(reasonText(null)).toBeNull();
    expect(reasonText("POLICY_CHANGED")).toMatch(/rules changed/);
    expect(reasonText("OUTCOME_UNKNOWN")).toMatch(/can’t confirm/);
    expect(reasonText("NOT_A_CODE")).toMatch(/does not describe/);
  });

  it("labels audit events, keeping approved, queued and executed separate", () => {
    expect(eventLabel("approval.approved")).toBe("Approved by a person");
    expect(eventLabel("execution.succeeded")).toBe("Execution completed");
    expect(eventLabel("brand.new_event")).toBe("brand new event");
  });

  it("describes conditions in the fixed grammar", () => {
    expect(conditionsText({ all: [] })).toBe("every request");
    expect(
      conditionsText({
        all: [{ field: "email", op: "email_domain_in", value: ["a.test", "b.test"] }],
      }),
    ).toBe("email is at a.test, b.test");
    expect(
      conditionsText({
        all: [
          { field: "company", op: "eq", value: "Acme" },
          { field: "full_name", op: "not_in", value: ["X"] },
        ],
      }),
    ).toBe("company is Acme and full name is none of X");
    expect(conditionsText(null)).toBe("custom conditions");
    expect(conditionsText({ any: [] })).toBe("custom conditions");
  });
});

describe("liveLifecycle", () => {
  it("shows an approved-then-stopped request as exactly that", () => {
    const stages = liveLifecycle("denied", "approved");
    expect(stages.map((s) => s.state)).toEqual(["done", "done", "stopped"]);
    expect(stages[2]?.label).toBe("Stopped before running");
  });

  it("never reports execution as completed unless the status says succeeded", () => {
    for (const status of ACTION_REQUEST_STATUSES) {
      for (const approval of [
        undefined,
        "pending",
        "approved",
        "rejected",
        "expired",
        "canceled",
      ] as const) {
        const execution = liveLifecycle(status, approval)[2];
        expect(execution?.state === "done", `${status}/${String(approval)}`).toBe(
          status === "succeeded",
        );
      }
    }
  });

  it("keeps a human rejection and an expired approval distinct from a policy denial", () => {
    expect(liveLifecycle("denied", "rejected")[1]?.label).toBe("Rejected by a person");
    expect(liveLifecycle("expired", "expired")[1]?.label).toBe("Approval expired");
    expect(liveLifecycle("denied", undefined)[0]?.label).toBe("Authorization denied");
    expect(liveLifecycle("queued_execution", "approved")[1]?.label).toBe("Approval granted");
    expect(liveLifecycle("queued_execution", undefined)[1]?.label).toBe("Approval not required");
  });
});
