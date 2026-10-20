import { Check, TriangleAlert } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { CodeTabs, type CodeTab } from "@/components/marketing/code-tabs";
import { IntegrationFlow } from "@/components/marketing/integration-flow";
import { Reveal } from "@/components/motion/reveal";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { HOME_SECTION_IDS } from "@/config/navigation";
import { cn } from "@/lib/cn";

const POINTS = [
  "Uses n8n’s built-in HTTP Request node. No custom node or SDK to start.",
  "The workflow holds only its AgentAxio credential, never the downstream tool’s.",
  "A stable Idempotency-Key makes retries safe; a changed payload under the same key is a conflict.",
  "Poll one endpoint for status. The workflow never receives an execution token.",
] as const;

/** What exists today, said plainly. Nothing here is marked as available. */
const AVAILABILITY: ReadonlyArray<{ name: string; status: string; first?: boolean }> = [
  {
    name: "n8n via HTTP Request",
    status: "First integration · V1 contract drafted, API not built",
    first: true,
  },
  { name: "TypeScript SDK", status: "Planned after the n8n demo · not started" },
  { name: "MCP tool gateways", status: "Considered for after private beta · not started" },
];

const TABS: readonly CodeTab[] = [
  {
    id: "request",
    label: "1 · Propose",
    headerLines: [
      "POST /v1/action-requests",
      "Authorization: Bearer <scoped-agent-key>",
      "Idempotency-Key: <random-unique-key>",
    ],
    json: `{
  "action": "crm.lead.create",
  "resource": "mockcrm/leads",
  "parameters": {
    "full_name": "Ada Example",
    "email": "ada@example.test",
    "company": "Sample Co"
  }
}`,
  },
  {
    id: "response",
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

export function DevelopersSection() {
  return (
    <Section
      id={HOME_SECTION_IDS.developers}
      tone="dark"
      aria-labelledby="developers-title"
      className="border-t border-border bg-surface"
    >
      <Container className="grid grid-cols-1 items-start gap-14 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-5">
          <Eyebrow>For developers</Eyebrow>
          <Heading id="developers-title" level={2} size="display-md" className="mt-5">
            n8n first. Two HTTP requests.
          </Heading>
          <Text variant="lead" className="mt-6">
            Route an agent’s tool call through AgentAxio. The decision, the approval and the
            execution all happen outside the workflow.
          </Text>

          <ul className="mt-9 space-y-4">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3 text-base leading-relaxed">
                <Check className="mt-1 size-4 shrink-0 text-primary-text" aria-hidden="true" />
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <h3 className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Integration status
            </h3>
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {AVAILABILITY.map((a) => (
                <li key={a.name} className="flex items-start gap-3 py-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full border",
                      a.first ? "border-primary bg-primary" : "border-border-strong",
                    )}
                  />
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div
            role="note"
            className="mt-8 flex gap-3 border-l-2 border-warning-border bg-warning-muted/60 p-4 text-sm leading-relaxed text-warning-text"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              <strong className="font-semibold">Scope.</strong> AgentAxio controls actions routed
              through it. A workflow or admin that still holds direct credentials to the downstream
              tool can bypass it.
            </p>
          </div>
        </Reveal>

        <Reveal y={40} delay={0.1} className="space-y-6 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs tracking-[0.14em] text-primary-text uppercase">
              Contract preview · V1 design
            </p>
            <p className="text-xs text-muted-foreground">The API is not available yet.</p>
          </div>
          <IntegrationFlow />
          <CodeTabs tabs={TABS} label="n8n request flow" />
        </Reveal>
      </Container>
    </Section>
  );
}
