import { describe, expect, it } from "vitest";
import { ACTION_REQUEST_STATUSES } from "@/lib/contracts";
import {
  actionLabel,
  GLOSSARY,
  PLAIN_AGENT_STATUS,
  PLAIN_EFFECT,
  PLAIN_STATUS,
  requestSentence,
} from "@/lib/plain-language";

describe("plain-language wording", () => {
  it("covers every request status from the contract", () => {
    for (const s of ACTION_REQUEST_STATUSES) {
      expect(PLAIN_STATUS[s].label.length).toBeGreaterThan(0);
      expect(PLAIN_STATUS[s].explanation.length).toBeGreaterThan(0);
    }
  });

  it("uses the friendly names for the key states", () => {
    expect(PLAIN_STATUS.pending_approval.label).toBe("Needs approval");
    expect(PLAIN_STATUS.denied.label).toBe("Blocked");
    expect(PLAIN_EFFECT).toEqual({
      allow: "Allowed",
      require_approval: "Needs approval",
      deny: "Blocked",
    });
    expect(PLAIN_AGENT_STATUS.active.label).toBe("Active");
  });

  it("never lets approval read as proof that the action ran", () => {
    expect(PLAIN_STATUS.approved.label).toMatch(/not run yet/i);
    expect(PLAIN_STATUS.approved.explanation).toMatch(/not proof/i);
    // Only `succeeded` may say the action completed.
    const claimsCompletion = ACTION_REQUEST_STATUSES.filter((s) =>
      /\bcompleted\b/i.test(PLAIN_STATUS[s].label),
    );
    expect(claimsCompletion).toEqual(["succeeded"]);
    expect(GLOSSARY.approval).toMatch(/not proof/i);
  });

  it("describes a request without exposing the technical action key", () => {
    const sentence = requestSentence({
      action: "crm.lead.create",
      parameters: { full_name: "Ada Lovelace", company: "Analytical Engines" },
    });
    expect(sentence).toBe("add a lead to the CRM: Ada Lovelace at Analytical Engines");
    expect(sentence).not.toContain("crm.lead.create");
    expect(actionLabel("crm.lead.create")).toBe("Add a lead");
  });
});
