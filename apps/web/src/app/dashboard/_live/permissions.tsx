import { Ban, Check, UserCheck } from "lucide-react";
import { HelpTip } from "@/components/dashboard/help-tip";
import { Panel } from "@/components/dashboard/panel";
import { PageHeader } from "@/components/layout/page-header";
import { ChangePolicyForm, CreatePolicyForm, EnvironmentSwitch } from "@/components/live/forms";
import { Badge } from "@/components/ui/badge";
import { conditionsText, relativeTime } from "@/lib/api/present";
import { canManage, type LiveSession } from "@/lib/api/server";
import type { ApiPolicy } from "@/lib/api/types";
import { GLOSSARY, PLAIN_EFFECT } from "@/lib/plain-language";
import { gate, LoadFailed } from "./gate";
import { getAgents, getEnvironments, getPolicies } from "./data";

const ANSWERS = [
  { effect: "allow", tone: "success", icon: Check, text: "The agent can go ahead straight away." },
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

const EFFECT_ICON = { allow: Check, require_approval: UserCheck, deny: Ban } as const;
const EFFECT_TONE = { allow: "success", require_approval: "warning", deny: "danger" } as const;

function RuleRow({
  rule,
  orgBase,
  editable,
}: {
  rule: ApiPolicy;
  orgBase: string;
  editable: boolean;
}) {
  const Icon = EFFECT_ICON[rule.effect];
  return (
    <li className="border-t border-border/50 px-6 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge
          tone={rule.enabled ? EFFECT_TONE[rule.effect] : "neutral"}
          className="px-3 py-1 text-[0.8125rem]"
        >
          <Icon aria-hidden="true" />
          {PLAIN_EFFECT[rule.effect]}
        </Badge>
        <span className="text-base">
          when {conditionsText(rule.conditions)}
          {rule.environment !== null ? ` · ${rule.environment} only` : ""}
        </span>
        {!rule.enabled ? <Badge tone="neutral">Off</Badge> : null}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Version {rule.version} · changed {relativeTime(rule.updatedAt)}
      </p>
      {editable ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-primary-text hover:underline">
            Change this rule
          </summary>
          <div className="mt-3">
            <ChangePolicyForm orgBase={orgBase} policy={rule} />
          </div>
        </details>
      ) : null}
    </li>
  );
}

export async function LivePermissionsPage({ session }: { session: LiveSession }) {
  const g = gate(session, "Permissions");
  if (!("ready" in g)) return g.node;
  const { org } = g.ready;
  const manager = canManage(org.role);
  const [policies, agents, environments] = await Promise.all([
    getPolicies(org.base),
    getAgents(org.base),
    getEnvironments(org.base),
  ]);
  if (!policies.ok) return <LoadFailed what="Permissions" />;

  const everyone = policies.data.filter((p) => p.agentId === null);
  const names = new Map(agents.ok ? agents.data.map((a) => [a.id, a.name]) : []);
  const byAgent = new Map<string, ApiPolicy[]>();
  for (const p of policies.data) {
    if (p.agentId === null) continue;
    byAgent.set(p.agentId, [...(byAgent.get(p.agentId) ?? []), p]);
  }

  return (
    <>
      <PageHeader
        title="Permissions"
        description="What each agent is allowed to do, and what needs a person’s approval."
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
            If nothing matches, the answer is “Blocked”. If rules disagree, “Blocked” beats “Needs
            approval”, which beats “Allowed”. The rules are fixed and predictable: an AI model never
            decides who gets access.
          </p>
        </Panel>

        <div className="space-y-6 xl:col-span-7">
          <Panel
            id="rules"
            title="Rules"
            description="Only requests that go through the AgentAxio API are checked against these."
            flush
          >
            {policies.data.length === 0 ? (
              <p className="px-6 pb-6 text-base text-muted-foreground">
                There are no rules yet, so every request is blocked.
                {manager ? " Add the first one below." : ""}
              </p>
            ) : (
              <div>
                {everyone.length > 0 ? (
                  <section aria-labelledby="rules-everyone">
                    <h3
                      id="rules-everyone"
                      className="px-6 pt-2 pb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      Every agent
                    </h3>
                    <ul>
                      {everyone.map((r) => (
                        <RuleRow key={r.id} rule={r} orgBase={org.base} editable={manager} />
                      ))}
                    </ul>
                  </section>
                ) : null}
                {[...byAgent.entries()].map(([agentId, rules]) => (
                  <section key={agentId} aria-labelledby={`rules-${agentId}`}>
                    <h3
                      id={`rules-${agentId}`}
                      className="px-6 pt-4 pb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {names.get(agentId) ?? "An agent"}
                    </h3>
                    <ul>
                      {rules.map((r) => (
                        <RuleRow key={r.id} rule={r} orgBase={org.base} editable={manager} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Panel>

          {manager && agents.ok && environments.ok ? (
            <Panel
              id="add-rule"
              title="Add a rule"
              description="For the action “add a lead to the CRM” (the only action in this pre-release)."
            >
              <CreatePolicyForm
                orgBase={org.base}
                agents={agents.data.filter((a) => a.status !== "revoked")}
                environments={environments.data}
              />
            </Panel>
          ) : null}

          {environments.ok ? (
            <Panel
              id="emergency-stop"
              title="Emergency stop"
              description="Stops every request in an environment at once, including ones already approved."
            >
              <ul className="space-y-5">
                {environments.data.map((e) =>
                  manager ? (
                    <li key={e.id}>
                      <EnvironmentSwitch orgBase={org.base} environment={e} />
                    </li>
                  ) : (
                    <li key={e.id} className="text-base">
                      <span className="font-medium">{e.name}</span>:{" "}
                      {e.state === "halted" ? "stopped" : "running normally"}
                    </li>
                  ),
                )}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
