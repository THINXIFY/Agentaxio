import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  FeaturedIntegration,
  integrationGroups,
  PlannedIntegrations,
} from "@/components/dashboard/integration-status";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { PageHeader } from "@/components/layout/page-header";

const STEPS = [
  {
    title: "Your workflow asks first",
    text: "Before an n8n workflow lets an agent do something important, it asks AgentAxio for permission.",
  },
  {
    title: "AgentAxio checks your rules",
    text: "The answer is one of three: allowed, needs a person’s approval, or blocked.",
  },
  {
    title: "Only then does it happen",
    text: "If it’s allowed or approved, AgentAxio carries the action out. If it’s blocked, it never runs.",
  },
] as const;

const TECHNICAL = [
  "The n8n workflow holds only its AgentAxio key, never the downstream tool’s own credentials.",
  "Only AgentAxio’s trusted executor holds the tool’s credentials and carries out the action.",
  "The permission to run an action is private to AgentAxio and is never sent to the workflow.",
  "If AgentAxio can’t be reached, the protected action does not run.",
] as const;

export function DemoIntegrationsPage() {
  const { featured, others } = integrationGroups();
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect the tools your agents work through. Nothing is connected yet."
        actions={<DemoBadge />}
      />

      <div className="space-y-10">
        <FeaturedIntegration integration={featured} />

        <section aria-labelledby="how-it-works-title">
          <h2 id="how-it-works-title" className="text-xl font-semibold tracking-tight">
            How it will work
          </h2>
          <ol className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-card border border-border/60 bg-surface p-6">
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-full bg-surface-sunken font-display text-base font-semibold"
                >
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-medium">{step.title}</h3>
                <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-3xl border-l-2 border-primary-text pl-4 text-base leading-relaxed text-muted-foreground">
            AgentAxio controls actions that go through it. A workflow that still holds its own
            direct credentials to a tool can bypass it, so those credentials move to AgentAxio.
          </p>

          <details className="group/tech mt-5">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-1 text-base font-medium text-primary-text marker:hidden hover:underline [&::-webkit-details-marker]:hidden">
              <ChevronRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 ease-standard group-open/tech:rotate-90"
              />
              Technical details
            </summary>
            <div className="mt-3 max-w-3xl rounded-card border border-border/60 bg-surface p-6">
              <ul className="space-y-3 text-base leading-relaxed">
                {TECHNICAL.map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground"
                    />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/#developers"
                className="mt-4 inline-block text-base font-medium text-primary-text hover:underline"
              >
                See the contract preview
              </Link>
            </div>
          </details>
        </section>

        <section aria-labelledby="more-title">
          <h2 id="more-title" className="text-xl font-semibold tracking-tight">
            More integrations
          </h2>
          <PlannedIntegrations integrations={others} className="mt-5" />
        </section>
      </div>
    </>
  );
}
