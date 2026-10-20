import * as React from "react";
import { CodeBlock } from "@/components/marketing/art/code-block";

/**
 * One request, start to finish, as the PROPOSED n8n contract describes it (docs/N8N-ENFORCEMENT.md). The API is not
 * implemented, the values are invented, and the page around this says so. Read top to bottom: the workflow proposes, AgentAxio
 * answers, a person decides, the executor acts, the workflow checks.
 */

const REQUEST_HEAD = [
  "POST /v1/action-requests",
  "Authorization: Bearer <scoped-agent-key>",
  "Idempotency-Key: <random-unique-key>",
] as const;

const REQUEST_JSON = `{
  "action": "crm.lead.create",
  "resource": "mockcrm/leads",
  "parameters": {
    "full_name": "Ada Example",
    "email": "ada@example.test",
    "company": "Sample Co"
  }
}`;

const STEPS: ReadonlyArray<{
  actor: string;
  does: string;
  code?: { label: string; head?: readonly string[]; json: string; note?: string };
}> = [
  {
    actor: "n8n workflow",
    does: "Proposes the action with the HTTP Request node. The agent and environment come from the key, never from the body.",
    code: { label: "Request", head: REQUEST_HEAD, json: REQUEST_JSON },
  },
  {
    actor: "AgentAxio",
    does: "Authenticates the key, applies the rules, and answers. Here a rule asked for a person.",
    code: {
      label: "Decision",
      head: ["202 Accepted"],
      json: `{
  "id": "opaque-request-id",
  "status": "pending_approval",
  "reason_code": "HUMAN_REVIEW_REQUIRED"
}`,
      note: "No grant or execution token is returned to the workflow.",
    },
  },
  {
    actor: "A reviewer",
    does: "Sees the exact values in the dashboard and approves. A changed value would be a new request needing a new approval.",
  },
  {
    actor: "Trusted executor",
    does: "Re-checks the agent, the credential and the current rules, consumes the single-use grant, performs the action on the mock CRM, and records the outcome.",
  },
  {
    actor: "n8n workflow",
    does: "Polls with the same key until the status is final.",
    code: {
      label: "Status",
      head: [
        "GET /v1/action-requests/opaque-request-id",
        "Authorization: Bearer <scoped-agent-key>",
      ],
      json: `{
  "id": "opaque-request-id",
  "status": "succeeded"
}`,
      note: "Final statuses: succeeded, failed, denied, expired, unknown.",
    },
  },
];

export function ContractSequence({ className }: { className?: string }) {
  return (
    <ol aria-label="One request, from proposal to outcome" className={className}>
      {STEPS.map((s, i) => (
        <li
          key={i}
          className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-border py-6 lg:grid-cols-[11rem_minmax(0,1fr)]"
        >
          <p className="flex items-baseline gap-3 lg:block">
            <span className="font-mono text-xs text-primary-text">0{i + 1}</span>
            <span className="text-sm font-semibold lg:mt-1.5 lg:block">{s.actor}</span>
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:gap-8">
            <p className="max-w-[48ch] text-base leading-relaxed text-muted-foreground">{s.does}</p>
            {s.code ? <CodeBlock {...s.code} /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
