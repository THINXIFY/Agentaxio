import type { Metadata } from "next";
import {
  ArrowLinks,
  ArtHero,
  Chapter,
  Prose,
  StatusMark,
  StatusStrip,
} from "@/components/marketing/art/chapter";
import { CodeBlock } from "@/components/marketing/art/code-block";
import { ContractSequence } from "@/components/marketing/art/contract-sequence";
import { LifecycleLedger } from "@/components/marketing/art/lifecycle-ledger";
import { WorkflowStrip } from "@/components/marketing/art/workflow-strip";
import { Reveal } from "@/components/motion/reveal";
import { Code } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Developers",
  description:
    "The proposed n8n-first integration: the request lifecycle, planned API endpoints, the trusted executor, and example requests and responses. None of this API is implemented yet.",
};

const RESPONSES = [
  {
    label: "A person must approve",
    note: "The rules asked for human review.",
    head: ["202 Accepted"],
    json: `{
  "id": "opaque-id",
  "status": "pending_approval",
  "reason_code": "HUMAN_REVIEW_REQUIRED"
}`,
  },
  {
    label: "Allowed, waiting to run",
    note: "No approval needed. The executor will run it.",
    head: ["202 Accepted"],
    json: `{
  "id": "opaque-id",
  "status": "queued_execution"
}`,
  },
  {
    label: "Blocked by a rule",
    note: "Nothing runs. Returned immediately.",
    head: ["403 Forbidden"],
    json: `{
  "id": "opaque-id",
  "status": "denied",
  "reason_code": "POLICY_DENY"
}`,
  },
] as const;

const ENDPOINTS = [
  {
    method: "POST",
    path: "/v1/action-requests",
    purpose:
      "Propose an action. The agent and environment come from the credential, not the body. Needs an Idempotency-Key.",
    status: "proposed" as const,
    label: "Proposed",
  },
  {
    method: "GET",
    path: "/v1/action-requests/:id",
    purpose:
      "Read the status of one request, with the same agent key. An authenticated completion callback may follow later.",
    status: "proposed" as const,
    label: "Proposed",
  },
  {
    method: "—",
    path: "Agents, policies, approvals and activity",
    purpose: "The management API behind the dashboard. Not yet specified in detail.",
    status: "planned" as const,
    label: "Planned",
  },
];

const CHECKS = [
  "The credential is still active",
  "The agent is still active, not suspended",
  "The current policy version still allows it",
  "The values match the approved payload digest exactly",
  "The grant is unused, unexpired and consumed atomically",
] as const;

const LIMITS = [
  {
    title: "Bypass by direct credentials",
    text: "Anyone who still holds direct credentials to the downstream tool can bypass AgentAxio. Don’t claim otherwise.",
  },
  {
    title: "Fails closed",
    text: "If the authorization API or its database can’t be reached, protected actions do not run, and the workflow fails.",
  },
  {
    title: "Retries need a stable key",
    text: "Retries are only safe with the same idempotency key. An uncertain external side effect is never repeated automatically.",
  },
  {
    title: "Nothing sensitive in logs",
    text: "Raw authorization headers, integration secrets and sensitive values are never logged.",
  },
] as const;

export default function DevelopersPage() {
  return (
    <>
      <ArtHero
        label="Developers"
        title="Two HTTP requests stand between a workflow and an action."
        lead="Route an agent’s tool call through AgentAxio with n8n’s built-in HTTP Request node. The decision, the approval and the execution all happen outside the workflow."
      >
        <StatusStrip kinds={["proposed", "designed", "planned"]}>
          Proposed contract: the API is not available yet, and every request and response below uses
          invented values.
        </StatusStrip>
        <div className="mt-2">
          <ContractSequence />
        </div>
      </ArtHero>

      <Chapter
        id="strategy"
        index="01"
        label="n8n first"
        round
        title="Start where agencies already build agents."
        lead="n8n workflows are where many agents take real actions, so the first integration goes there. A custom node and a TypeScript SDK come after the end-to-end demo is proven."
      >
        <Reveal className="space-y-10">
          <WorkflowStrip />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
            <Prose className="text-base">
              <p>
                The workflow holds only its AgentAxio credential, never the downstream tool’s. It
                proposes an action, then checks the status in a bounded loop.
              </p>
              <p>
                n8n has its own human review for tool calls. You can use it alongside AgentAxio, but
                it does not count as AgentAxio enforcement. What AgentAxio adds is reusable rules
                per organization, agent identities, revocation, central approvals and one history
                across workflows.
              </p>
            </Prose>
            <p className="self-start border-l-2 border-warning-border pl-5 text-base leading-relaxed">
              <strong className="font-semibold text-warning-text">
                Don’t add a direct tool node after an “allow”.
              </strong>{" "}
              <span className="text-muted-foreground">
                The workflow must never create the lead itself once it hears “allowed”. The mock CRM
                in the demonstration sits behind AgentAxio’s executor, so that is the only path that
                can reach it.
              </span>
            </p>
          </div>
        </Reveal>
      </Chapter>

      <Chapter
        id="lifecycle"
        index="02"
        label="Lifecycle"
        tone="dark"
        wide
        title="Nine statuses, one vocabulary."
        lead="These names are the contract. The dashboard says the same things in plainer words, but the API uses these."
      >
        <Reveal>
          <LifecycleLedger />
        </Reveal>
      </Chapter>

      <Chapter
        id="endpoints"
        index="03"
        label="Endpoints"
        wide
        title="Two calls for the first integration."
        lead="Exact details will be published as a generated OpenAPI specification and tested. Until then this is a sketch."
      >
        <Reveal>
          <ul className="border-t border-border">
            {ENDPOINTS.map((e) => (
              <li
                key={e.path}
                className="grid grid-cols-1 gap-x-8 gap-y-2 border-b border-border py-5 md:grid-cols-[minmax(0,18rem)_1fr_6rem] md:items-baseline"
              >
                <p className="font-mono text-sm break-words">
                  <span className="text-primary-text">{e.method}</span> {e.path}
                </p>
                <p className="text-base leading-relaxed text-muted-foreground">{e.purpose}</p>
                <StatusMark status={e.status} className="md:justify-end">
                  {e.label}
                </StatusMark>
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            Authentication is a scoped agent key sent as <Code>Authorization: Bearer …</Code>. Which
            agent, organization and environment is asking is derived on the server from that key and
            is never accepted from the request body.
          </p>
        </Reveal>
      </Chapter>

      <Chapter
        id="executor"
        index="04"
        label="Trusted executor"
        tone="dark"
        title="The workflow proposes. The executor acts."
        lead="Only the executor holds the tool’s credentials. When an action is allowed or approved, AgentAxio keeps an internal, single-use grant that is never sent to n8n, so the workflow has nothing to replay or forward."
      >
        <Reveal>
          <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
            Checked again, just before anything runs
          </p>
          <ol
            aria-label="Checks before anything runs"
            className="mt-4 max-w-2xl border-t border-border"
          >
            {CHECKS.map((c, i) => (
              <li
                key={c}
                className="flex gap-5 border-b border-border py-3.5 text-base leading-snug"
              >
                <span className="font-mono text-xs text-primary-text">0{i + 1}</span>
                {c}
              </li>
            ))}
          </ol>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Only then does it perform the action and record what happened. Any error means it does
            not run.
          </p>
        </Reveal>
      </Chapter>

      <Chapter
        id="examples"
        index="05"
        label="Examples"
        wide
        title="Three ways a request can answer."
        lead="Bodies are proposed formats with invented values."
      >
        <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {RESPONSES.map((r) => (
            <div key={r.label}>
              <p className="text-base font-semibold">{r.label}</p>
              <p className="mt-0.5 mb-3 text-sm text-muted-foreground">{r.note}</p>
              <CodeBlock label={r.label} head={r.head} json={r.json} />
            </div>
          ))}
        </Reveal>
      </Chapter>

      <Chapter
        id="limits"
        index="06"
        label="Limits"
        tone="dark"
        wide
        title="What this design does not do."
      >
        <Reveal className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
          {LIMITS.map((l) => (
            <div key={l.title} className="border-t border-border pt-4">
              <p className="text-base font-semibold">{l.title}</p>
              <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">{l.text}</p>
            </div>
          ))}
        </Reveal>
        <ArrowLinks
          className="mt-12 border-t border-border pt-6"
          links={[
            { href: "/security", label: "The security approach" },
            { href: "/dashboard/integrations", label: "Integrations in the demo" },
            { href: "/contact", label: "Tell us what your workflows do" },
          ]}
        />
      </Chapter>
    </>
  );
}
