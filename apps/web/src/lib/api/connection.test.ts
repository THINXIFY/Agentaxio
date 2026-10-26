import { describe, expect, it } from "vitest";
import { describeConnection } from "./connection";
import type { ApiAgent } from "./types";

const agent = (over: Partial<ApiAgent> = {}): ApiAgent => ({
  id: "a1",
  name: "Agent",
  description: null,
  status: "active",
  environment: "dev",
  environmentId: "e",
  ownerUserId: "u",
  createdAt: "2026-10-26T10:00:00Z",
  lastRequestAt: null,
  activeCredentials: 1,
  pendingApprovals: 0,
  ...over,
});

describe("describeConnection", () => {
  it("is not connected when there is no agent, or only revoked ones", () => {
    expect(describeConnection([]).state).toBe("no-agent");
    expect(describeConnection([agent({ status: "revoked" })]).state).toBe("no-agent");
  });

  it("asks for a key when no agent has one", () => {
    expect(describeConnection([agent({ activeCredentials: 0 })]).state).toBe("no-key");
  });

  it("waits for the first request once a key exists", () => {
    const c = describeConnection([agent()]);
    expect(c.state).toBe("waiting");
    expect(c.lastRequestAt).toBeNull();
  });

  it("reports the latest request among agents that are on and hold a key", () => {
    const c = describeConnection([
      agent({ id: "a", lastRequestAt: "2026-10-26T09:00:00Z" }),
      agent({ id: "b", lastRequestAt: "2026-10-26T09:30:00Z" }),
    ]);
    expect(c).toMatchObject({ state: "receiving", lastRequestAt: "2026-10-26T09:30:00Z" });
  });

  it("does not count a suspended agent or one without a key as connected, however recent its last request", () => {
    expect(
      describeConnection([agent({ status: "suspended", lastRequestAt: "2026-10-26T09:30:00Z" })])
        .state,
    ).toBe("no-key");
    expect(
      describeConnection([agent({ activeCredentials: 0, lastRequestAt: "2026-10-26T09:30:00Z" })])
        .state,
    ).toBe("no-key");
  });

  it("lists every non-revoked agent with its facts", () => {
    const c = describeConnection([
      agent({ id: "x", name: "X" }),
      agent({ id: "y", status: "revoked" }),
    ]);
    expect(c.agents).toEqual([
      {
        id: "x",
        name: "X",
        environment: "dev",
        status: "active",
        hasActiveKey: true,
        lastRequestAt: null,
      },
    ]);
  });
});
