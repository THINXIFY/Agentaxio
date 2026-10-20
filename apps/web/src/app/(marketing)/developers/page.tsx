import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { CodeTabs, type CodeTab } from "@/components/marketing/code-tabs";
import { MonoLabel, PageCta, SectionHeading, Window } from "@/components/marketing/site/blocks";
import { Callout } from "@/components/marketing/site/callout";
import { ExecutorChecks, N8nWorkflow } from "@/components/marketing/site/diagrams";
import { StatusLifecycle } from "@/components/marketing/site/lifecycle";
import { PageHero } from "@/components/marketing/site/page-hero";
import { StatusPill } from "@/components/marketing/site/status-pill";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Code } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Developers",
  description:
    "The proposed n8n-first integration: the authorization request lifecycle, planned API endpoints, the trusted executor, and example requests and responses. None of this API is implemented yet.",
};

const REQUEST_HEADERS = [
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

const HERO_TABS: readonly CodeTab[] = [
  { id: "request", label: "1 · Propose", headerLines: REQUEST_HEADERS, json: REQUEST_JSON },
  {
    id: "decision",
    label: "2 · Decision",
    headerLines: ["202 Accepted"],
    json: `{
  "id": "opaque-request-id",
  "status": "pending_approval",
  "reason_code": "HUMAN_REVIEW_REQUIRED"
}`,
    caption: "No grant or execution token is returned to the workflow.",
  },
  {
    id: "poll",
    label: "3 · Poll",
    headerLines: [
      "GET /v1/action-requests/opaque-request-id",
      "Authorization: Bearer <scoped-agent-key>",
    ],
    json: `{
  "id": "opaque-request-id",
  "status": "succeeded"
}`,
    caption: "Final statuses: succeeded, failed, denied, expired, unknown.",
  },
];

const RESPONSES: ReadonlyArray<{
  title: string;
  note: string;
  http: string;
  json: string;
}> = [
  {
    title: "A person must approve",
    note: "The rules asked for human review.",
    http: "202 Accepted",
    json: `{
  "id": "opaque-id",
  "status": "pending_approval",
  "reason_code": "HUMAN_REVIEW_REQUIRED"
}`,
  },
  {
    title: "Allowed, waiting to run",
    note: "No approval needed. The executor will run it.",
    http: "202 Accepted",
    json: `{
  "id": "opaque-id",
  "status": "queued_execution"
}`,
  },
  {
    title: "Blocked by a rule",
    note: "Nothing runs. Returned immediately.",
    http: "403 Forbidden",
    json: `{
  "id": "opaque-id",
  "status": "denied",
  "reason_code": "POLICY_DENY"
}`,
  },
];

const ENDPOINTS: ReadonlyArray<{
  method: string;
  path: string;
  purpose: string;
  status: "proposed" | "planned";
}> = [
  {
    method: "POST",
    path: "/v1/action-requests",
    purpose:
      "Propose an action. The agent and environment come from the credential, not the body. Needs an Idempotency-Key.",
    status: "proposed",
  },
  {
    method: "GET",
    path: "/v1/action-requests/:id",
    purpose:
      "Read the status of one request, with the same agent key. An authenticated completion callback may follow later.",
    status: "proposed",
  },
  {
    method: "—",
    path: "Agents, policies, approvals and activity",
    purpose: "The management API behind the dashboard. Not yet specified in detail.",
    status: "planned",
  },
];

export default function DevelopersPage() {
  return (
    <>
      <PageHero
        eyebrow="For developers"
        title="n8n first. Two HTTP requests."
        lead="Route an agent’s tool call through AgentAxio with n8n’s built-in HTTP Request node. The decision, the approval and the execution all happen outside the workflow."
        status={
          <>
            <StatusPill status="proposed" />
            <StatusPill status="designed" label="API not available yet" />
          </>
        }
        actions={
          <>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href="#lifecycle">
                Request lifecycle <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/dashboard/integrations">Integrations in the demo</Link>
            </Button>
          </>
        }
        aside={
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MonoLabel className="text-primary-text">Proposed contract · V1 design</MonoLabel>
              <p className="text-xs text-muted-foreground">Examples use invented values.</p>
            </div>
            <CodeTabs tabs={HERO_TABS} label="Example request, decision and status" />
          </div>
        }
      />

      <Section tone="light" aria-labelledby="strategy-title" className="py-20 sm:py-28">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHeading
                id="strategy-title"
                eyebrow="n8n-first strategy"
                title="Start where agencies already work."
                lead="n8n workflows are where many agents take real actions, so that is where the first integration goes. A custom node and a TypeScript SDK come later, after the end-to-end demo is proven."
              />
            </div>
            <Reveal className="space-y-5 lg:col-span-7">
              <p className="text-lg leading-relaxed text-muted-foreground">
                The workflow holds only its AgentAxio credential, never the downstream tool’s. It
                proposes an action, then checks the status in a bounded loop.
              </p>
              <p className="text-base leading-relaxed text-muted-foreground">
                n8n already has its own human review for tool calls. You can use it alongside
                AgentAxio, but it does not count as AgentAxio enforcement. What AgentAxio adds is
                reusable rules per organization, agent identities, revocation, central approvals and
                one history across workflows.
              </p>
            </Reveal>
          </div>

          <Reveal y={32} className="mt-14">
            <Window title="The first n8n workflow" status={<StatusPill status="proposed" />}>
              <N8nWorkflow />
            </Window>
          </Reveal>

          <div className="mt-8 max-w-3xl">
            <Callout tone="scope" title="Don’t add a direct tool node after an “allow”">
              The workflow must never create the lead itself once it hears “allowed”. The mock CRM
              in the demonstration sits behind AgentAxio’s executor, so that is the only path that
              can reach it.
            </Callout>
          </div>
        </Container>
      </Section>

      <Section
        id="lifecycle"
        tone="dark"
        aria-labelledby="lifecycle-title"
        className="scroll-mt-(--topbar-height) border-t border-border py-20 sm:py-28"
      >
        <Container>
          <SectionHeading
            id="lifecycle-title"
            eyebrow="Authorization request lifecycle"
            title="Nine statuses, one vocabulary."
            lead="These names are the contract. The dashboard says the same things in plainer words, but the API uses these."
          />
          <Reveal y={28} className="mt-12">
            <StatusLifecycle />
          </Reveal>
        </Container>
      </Section>

      <Section tone="light" aria-labelledby="endpoints-title" className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            id="endpoints-title"
            eyebrow="Planned API endpoints"
            title="Two calls for the first integration."
            lead="Exact details will be published as a generated OpenAPI specification and tested. Until then this is a sketch."
          />
          <Reveal y={28} className="mt-12">
            <ul className="divide-y divide-border border-y border-border">
              {ENDPOINTS.map((e) => (
                <li
                  key={e.path}
                  className="grid grid-cols-1 gap-x-8 gap-y-2 py-6 md:grid-cols-[minmax(0,18rem)_1fr_auto] md:items-start"
                >
                  <p className="font-mono text-sm break-words">
                    <span className="text-primary-text">{e.method}</span> {e.path}
                  </p>
                  <p className="text-base leading-relaxed text-muted-foreground">{e.purpose}</p>
                  <StatusPill status={e.status} className="w-fit" />
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">
              Authentication is a scoped agent key sent as <Code>Authorization: Bearer …</Code>.
              Which agent, organization and environment is asking is derived on the server from that
              key and is never accepted from the request body.
            </p>
          </Reveal>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="executor-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-6">
            <SectionHeading
              id="executor-title"
              eyebrow="Trusted executor architecture"
              title="The workflow proposes. The executor acts."
              lead="Only the executor holds the tool’s credentials. When an action is allowed or approved, AgentAxio keeps an internal, single-use grant that is never sent to n8n, so the workflow has nothing to replay or forward."
            />
          </Reveal>
          <Reveal y={32} delay={0.08} className="lg:col-span-6">
            <Window
              title="Checked again just before anything runs"
              status={<StatusPill status="designed" />}
            >
              <ExecutorChecks />
            </Window>
          </Reveal>
        </Container>
      </Section>

      <Section tone="light" aria-labelledby="examples-title" className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            id="examples-title"
            eyebrow="Example responses"
            title="Three ways a request can answer."
            lead="Request and response bodies below are proposed formats with invented values."
          />
          <Reveal y={28} className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {RESPONSES.map((r) => (
              <figure
                key={r.title}
                className="surface-dark flex flex-col overflow-hidden rounded-card border border-border"
              >
                <figcaption className="border-b border-border px-5 py-4">
                  <p className="text-base font-semibold">{r.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{r.note}</p>
                </figcaption>
                <div className="flex-1 p-5">
                  <p className="font-mono text-xs text-muted-foreground">{r.http}</p>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label={`${r.title}, example response (scrollable)`}
                    className="mt-3 overflow-x-auto font-mono text-[0.8125rem] leading-relaxed"
                  >
                    <code>{r.json}</code>
                  </pre>
                </div>
              </figure>
            ))}
          </Reveal>
        </Container>
      </Section>

      <Section
        tone="dark"
        aria-labelledby="limits-title"
        className="border-t border-border py-20 sm:py-28"
      >
        <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              id="limits-title"
              eyebrow="Limits to know about"
              title="What this design does not do."
            />
          </div>
          <Reveal className="space-y-4 lg:col-span-7">
            <Callout tone="scope" title="Bypass by direct credentials">
              Anyone who still holds direct credentials to the downstream tool can bypass AgentAxio.
              Don’t claim otherwise.
            </Callout>
            <Callout tone="info" title="Fails closed">
              If the authorization API or its database can’t be reached, protected actions do not
              run, and the workflow fails.
            </Callout>
            <Callout tone="info" title="Retries need a stable key">
              Retries are only safe with the same idempotency key. An uncertain external side effect
              is never repeated automatically.
            </Callout>
            <Callout tone="info" title="Nothing sensitive in logs">
              Raw authorization headers, integration secrets and sensitive values are never logged.
            </Callout>
          </Reveal>
        </Container>
      </Section>

      <PageCta
        title="Building with n8n or agents?"
        text="Tell us what your workflows do and what you would want to guard. It decides what we build first."
        primary={{ href: "/contact", label: "Get in touch" }}
        secondary={{ href: "/security", label: "Security approach" }}
      />
    </>
  );
}
