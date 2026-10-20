import type { Metadata } from "next";
import { Ban, Check, ChevronRight, UserCheck } from "lucide-react";
import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel } from "@/components/dashboard/panel";
import { PermissionSummary } from "@/components/dashboard/permission-summary";
import { DemoBadge } from "@/components/feedback/demo-notice";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { GLOSSARY, PLAIN_EFFECT } from "@/lib/plain-language";
import { listDashboardAgents } from "@/mocks/dashboard";

export const metadata: Metadata = { title: "Permissions" };

const ANSWERS = [
  {
    effect: "allow",
    tone: "success",
    icon: Check,
    text: "The agent can go ahead straight away.",
  },
  {
    effect: "require_approval",
    tone: "warning",
    icon: UserCheck,
    text: "The agent has to wait until a person says yes.",
  },
  {
    effect: "deny",
    tone: "danger",
    icon: Ban,
    text: "The agent is stopped and the action does not happen.",
  },
] as const;

export default function PermissionsPage() {
  const agents = listDashboardAgents();
  return (
    <>
      <PageHeader
        title="Permissions"
        description="What each agent is allowed to do, and what needs a person’s approval."
        actions={<DemoBadge />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel
          id="answers"
          title="Every request gets one of three answers"
          aside={<HelpTip term="Permission check">{GLOSSARY.permissionCheck}</HelpTip>}
          className="xl:col-span-5 xl:self-start"
        >
          <ul className="space-y-4">
            {ANSWERS.map(({ effect, tone, icon: Icon, text }) => (
              <li key={effect} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Badge tone={tone} className="px-3 py-1 text-[0.8125rem]">
                  <Icon aria-hidden="true" />
                  {PLAIN_EFFECT[effect]}
                </Badge>
                <span className="text-base text-muted-foreground">{text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-l-2 border-primary-text pl-4 text-base leading-relaxed text-muted-foreground">
            If nothing matches, the answer is “Blocked”. The rules are fixed and predictable: an AI
            model never decides who gets access.
          </p>
        </Panel>

        <Panel
          id="by-agent"
          title="What each agent can do"
          description="Sample rules. Open an agent to see them."
          flush
          className="xl:col-span-7"
        >
          <ul>
            {agents.map((a) => (
              <li key={a.id} className="border-t border-border/50 first:border-t-0">
                <details className="group/rules">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-6 py-4 text-base font-medium marker:hidden hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard group-open/rules:rotate-90"
                    />
                    {a.name}
                  </summary>
                  <div className="px-6 pt-1 pb-6 pl-13">
                    <PermissionSummary permissions={a.permissions} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <p className="mt-8 max-w-3xl text-base leading-relaxed text-muted-foreground">
        <Badge tone="neutral" className="mr-2">
          Not built yet
        </Badge>
        Changing permissions isn’t available in the pre-release. It arrives with the first backend
        milestone, and until then these rules are examples only: nothing here is enforced.
      </p>
    </>
  );
}
