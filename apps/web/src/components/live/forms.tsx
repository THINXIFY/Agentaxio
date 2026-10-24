"use client";

import * as React from "react";
import { Copy, KeyRound } from "lucide-react";
import { ActionError, useApiAction } from "@/components/live/use-api-action";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { conditionsText } from "@/lib/api/present";
import type { ApiCredential, ApiPolicy, PolicyEffectName } from "@/lib/api/types";
import { formatDateTimeUtc } from "@/lib/format";

/* ---------------------------------------------------------------------------------------------------------------- */
/* Agents                                                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */

export function CreateAgentForm({
  orgBase,
  environments,
  ownerUserId,
}: {
  orgBase: string;
  environments: ReadonlyArray<{ id: string; name: string }>;
  /** The signed-in person, who becomes the agent’s owner. */
  ownerUserId: string;
}) {
  const { run, pending, failure } = useApiAction();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [environmentId, setEnvironmentId] = React.useState(environments[0]?.id ?? "");
  const [created, setCreated] = React.useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void run<{ agentId: string }>(`${orgBase}/agents`, {
          name: name.trim(),
          ...(description.trim() === "" ? {} : { description: description.trim() }),
          environmentId,
          ownerUserId,
        }).then((result) => {
          if (result.ok) {
            setCreated(name.trim());
            setName("");
            setDescription("");
          }
        });
      }}
    >
      <Field label="Name" required>
        <Input
          value={name}
          maxLength={200}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </Field>
      <Field label="What is it for?" hint="One sentence is enough.">
        <Textarea
          value={description}
          maxLength={1000}
          rows={2}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </Field>
      <Field label="Environment" required>
        <Select
          value={environmentId}
          onChange={(e) => {
            setEnvironmentId(e.target.value);
          }}
        >
          {environments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </Field>
      <ActionError failure={failure} />
      {created !== null ? (
        <p role="status" className="text-sm font-medium">
          “{created}” was added. It can’t do anything yet: open it to create its access key, then
          set what it is allowed to do under Permissions.
        </p>
      ) : null}
      <Button type="submit" loading={pending} disabled={name.trim() === "" || environmentId === ""}>
        Add agent
      </Button>
    </form>
  );
}

export function AgentStatusActions({
  orgBase,
  agentId,
  status,
}: {
  orgBase: string;
  agentId: string;
  status: "active" | "suspended" | "revoked";
}) {
  const { run, pending, failure } = useApiAction();
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);
  if (status === "revoked")
    return (
      <p className="text-sm text-muted-foreground">
        This agent was revoked and can’t be switched back on.
      </p>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {status === "active" ? (
          <Button
            variant="outline"
            loading={pending}
            onClick={() => void run(`${orgBase}/agents/${agentId}/suspend`)}
          >
            Suspend (switch off)
          </Button>
        ) : (
          <Button loading={pending} onClick={() => void run(`${orgBase}/agents/${agentId}/resume`)}>
            Resume
          </Button>
        )}
        {confirmRevoke ? (
          <>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => void run(`${orgBase}/agents/${agentId}/revoke`)}
            >
              Yes, revoke permanently
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmRevoke(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="danger"
            onClick={() => {
              setConfirmRevoke(true);
            }}
          >
            Revoke…
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Suspending or revoking stops everything this agent has waiting, straight away. Revoking also
        ends all its keys and can’t be undone.
      </p>
      <ActionError failure={failure} />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Access keys                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------------- */

interface IssuedKey {
  fullKey: string;
}

/**
 * An agent’s access keys. A new key is shown ONCE, here, in this browser tab’s memory, and is never stored by the page:
 * reload and it is gone for good (AgentAxio keeps only a one-way fingerprint).
 */
export function CredentialsPanel({
  orgBase,
  agentId,
  agentStatus,
  credentials,
  canManage,
}: {
  orgBase: string;
  agentId: string;
  agentStatus: "active" | "suspended" | "revoked";
  credentials: readonly ApiCredential[];
  canManage: boolean;
}) {
  const { run, pending, failure } = useApiAction();
  const toast = useToast();
  const [revealed, setRevealed] = React.useState<string | null>(null);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: "Key copied",
        description: "It won’t be shown again after you leave this page.",
      });
    } catch {
      toast({
        title: "Couldn’t copy",
        description: "Select the key and copy it by hand.",
        tone: "warning",
      });
    }
  };

  return (
    <div className="space-y-5">
      {revealed !== null ? (
        <div
          role="status"
          className="rounded-control border border-warning-border bg-warning-muted p-4"
        >
          <p className="text-base font-medium">Copy this key now: it is shown only once.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Put it in the tool that runs this agent (for example an n8n credential). Anyone who has
            it can ask AgentAxio for permission as this agent.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded-control bg-surface-sunken px-3 py-2 font-mono text-sm break-all">
              {revealed}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy key"
              onClick={() => void copy(revealed)}
            >
              <Copy className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              setRevealed(null);
            }}
          >
            I’ve saved it
          </Button>
        </div>
      ) : null}

      {credentials.length === 0 ? (
        <p className="text-base text-muted-foreground">This agent has no access key yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {credentials.map((c) => {
            const active =
              c.revokedAt === null && (c.expiresAt === null || new Date(c.expiresAt) > new Date());
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-base">{c.keyId}…</p>
                  <p className="text-sm text-muted-foreground">
                    Created {formatDateTimeUtc(c.createdAt)} ·{" "}
                    {c.revokedAt !== null
                      ? `revoked (${c.revokedReason ?? "manual"})`
                      : active
                        ? "active"
                        : "expired"}
                  </p>
                </div>
                {canManage && active ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={pending}
                      onClick={() =>
                        void run<IssuedKey>(
                          `${orgBase}/agents/${agentId}/credentials/${c.id}/rotate`,
                        ).then((r) => {
                          if (r.ok) setRevealed(r.data.fullKey);
                        })
                      }
                    >
                      Replace
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={pending}
                      onClick={() => void run(`${orgBase}/credentials/${c.id}/revoke`)}
                    >
                      Revoke
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && agentStatus !== "revoked" ? (
        <Button
          loading={pending}
          onClick={() =>
            void run<IssuedKey>(`${orgBase}/agents/${agentId}/credentials`).then((r) => {
              if (r.ok) setRevealed(r.data.fullKey);
            })
          }
        >
          <KeyRound aria-hidden="true" />
          Create a new access key
        </Button>
      ) : null}
      <ActionError failure={failure} />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Permissions                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------------- */

const EFFECT_OPTIONS: ReadonlyArray<{ value: PolicyEffectName; label: string }> = [
  { value: "require_approval", label: "Needs a person’s approval" },
  { value: "allow", label: "Allowed straight away" },
  { value: "deny", label: "Blocked" },
];

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function CreatePolicyForm({
  orgBase,
  agents,
  environments,
}: {
  orgBase: string;
  agents: ReadonlyArray<{ id: string; name: string }>;
  environments: ReadonlyArray<{ id: string; name: string }>;
}) {
  const { run, pending, failure } = useApiAction();
  const [agentId, setAgentId] = React.useState("");
  const [environmentId, setEnvironmentId] = React.useState("");
  const [effect, setEffect] = React.useState<PolicyEffectName>("require_approval");
  const [domains, setDomains] = React.useState("");
  const [added, setAdded] = React.useState(false);

  const domainList = domains
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d !== "");
  const domainError = domainList.find((d) => !DOMAIN.test(d));

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void run(`${orgBase}/policies`, {
          actionKey: "crm.lead.create",
          effect,
          conditions: {
            all:
              domainList.length === 0
                ? []
                : [{ field: "email", op: "email_domain_in", value: domainList }],
          },
          ...(agentId === "" ? {} : { agentId }),
          ...(environmentId === "" ? {} : { environmentId }),
        }).then((result) => {
          if (result.ok) {
            setAdded(true);
            setDomains("");
          }
        });
      }}
    >
      <Field label="Agent">
        <Select
          value={agentId}
          onChange={(e) => {
            setAgentId(e.target.value);
          }}
        >
          <option value="">Every agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Environment">
        <Select
          value={environmentId}
          onChange={(e) => {
            setEnvironmentId(e.target.value);
          }}
        >
          <option value="">Every environment</option>
          {environments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="When the lead’s email is at these domains"
        hint="Optional, comma-separated, e.g. acme.com, partner.org. Leave empty for every lead."
        {...(domainError === undefined ? {} : { error: `“${domainError}” isn’t a valid domain.` })}
      >
        <Input
          value={domains}
          onChange={(e) => {
            setDomains(e.target.value);
          }}
        />
      </Field>
      <Field label="Then" required>
        <Select
          value={effect}
          onChange={(e) => {
            setEffect(e.target.value as PolicyEffectName);
          }}
        >
          {EFFECT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-muted-foreground">
        If more than one rule matches, “Blocked” wins over “Needs approval”, which wins over
        “Allowed”. If no rule matches, the request is blocked.
      </p>
      <ActionError failure={failure} />
      {added ? (
        <p role="status" className="text-sm font-medium">
          Rule added. It applies to new requests straight away.
        </p>
      ) : null}
      <Button type="submit" loading={pending} disabled={domainError !== undefined}>
        Add rule
      </Button>
    </form>
  );
}

/** Change what an existing rule does. This saves a NEW version; earlier versions stay in the history. */
export function ChangePolicyForm({ orgBase, policy }: { orgBase: string; policy: ApiPolicy }) {
  const { run, pending, failure } = useApiAction();
  const [effect, setEffect] = React.useState<PolicyEffectName>(policy.effect);
  const [enabled, setEnabled] = React.useState(policy.enabled);
  const changed = effect !== policy.effect || enabled !== policy.enabled;
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run(`${orgBase}/policies/${policy.id}/versions`, {
          expectedVersion: policy.version,
          effect,
          enabled,
          priority: policy.priority,
          conditions: policy.conditions,
        });
      }}
    >
      <Field label={`Change rule (${conditionsText(policy.conditions)})`} className="min-w-52">
        <Select
          value={effect}
          onChange={(e) => {
            setEffect(e.target.value as PolicyEffectName);
          }}
        >
          {EFFECT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex h-10 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
          }}
        />
        Rule is on
      </label>
      <Button type="submit" size="sm" loading={pending} disabled={!changed}>
        Save
      </Button>
      <ActionError failure={failure} />
    </form>
  );
}

export function EnvironmentSwitch({
  orgBase,
  environment,
}: {
  orgBase: string;
  environment: { id: string; name: string; state: "active" | "halted" };
}) {
  const { run, pending, failure } = useApiAction();
  const halted = environment.state === "halted";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-base font-medium">{environment.name}</p>
        <p className="text-sm text-muted-foreground">
          {halted ? "Stopped: every request here is blocked." : "Running normally."}
        </p>
      </div>
      <Button
        variant={halted ? "primary" : "danger"}
        size="sm"
        loading={pending}
        onClick={() =>
          void run(`${orgBase}/environments/${environment.id}/${halted ? "resume" : "halt"}`)
        }
      >
        {halted ? "Resume" : "Stop everything"}
      </Button>
      <ActionError failure={failure} />
    </div>
  );
}
