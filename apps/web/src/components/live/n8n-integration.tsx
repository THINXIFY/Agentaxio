import * as React from "react";
import Link from "next/link";
import { CircleCheck, CircleDashed, Download, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Code } from "@/components/ui/typography";
import { WORKFLOW_FILE, type Connection, type ConnectionState } from "@/lib/api/connection";
import { relativeTime } from "@/lib/api/present";
import { formatDateTimeUtc } from "@/lib/format";

const STATE_TEXT: Record<ConnectionState, { label: string; detail: string; connected: boolean }> = {
  "no-agent": {
    label: "Not connected",
    detail: "There is no agent yet. Add one under My Agents, then create its access key.",
    connected: false,
  },
  "no-key": {
    label: "Not connected",
    detail: "No agent that is switched on has an access key. Create a key on the agent’s page.",
    connected: false,
  },
  waiting: {
    label: "Ready · waiting for the first request",
    detail: "An agent has a key. Run the example workflow in n8n to send the first request.",
    connected: false,
  },
  receiving: {
    label: "Receiving requests",
    detail: "A request has arrived with an agent’s access key.",
    connected: true,
  },
};

/** "● Receiving requests" / "○ Not connected": an icon plus words, so the state never relies on colour. */
export function ConnectionLine({ connection }: { connection: Connection }) {
  const t = STATE_TEXT[connection.state];
  const Icon = t.connected ? CircleCheck : CircleDashed;
  return (
    <div>
      <p className="inline-flex items-center gap-2 text-base font-medium">
        <Icon
          aria-hidden="true"
          className={t.connected ? "size-4 text-success-text" : "size-4 text-muted-foreground"}
        />
        {t.label}
        {connection.lastRequestAt !== null && t.connected ? (
          <span className="font-normal text-muted-foreground">
            {" · last request "}
            <time
              dateTime={connection.lastRequestAt}
              title={formatDateTimeUtc(connection.lastRequestAt)}
            >
              {relativeTime(connection.lastRequestAt)}
            </time>
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{t.detail}</p>
    </div>
  );
}

/** The featured n8n card with real connection facts. */
export function N8nCard({ connection }: { connection: Connection }) {
  return (
    <article
      aria-labelledby="integration-n8n"
      className="rounded-card border border-border/60 bg-surface p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-card bg-subtle text-subtle-foreground"
          >
            <Workflow className="size-7" />
          </span>
          <div className="min-w-0">
            <h2 id="integration-n8n" className="text-2xl font-semibold tracking-tight">
              n8n
            </h2>
            <p className="mt-1 text-base text-muted-foreground">Workflow automation</p>
          </div>
        </div>
        <Badge tone="brand" className="px-3 py-1 text-[0.8125rem]">
          First integration · local development
        </Badge>
      </div>

      <p className="mt-6 max-w-2xl text-lg leading-relaxed">
        Let your n8n workflows ask AgentAxio before an agent does something important, so the right
        actions are allowed, held for approval, or blocked.
      </p>

      <dl className="mt-7 grid gap-x-8 gap-y-5 border-t border-border/60 pt-6 sm:grid-cols-2">
        <div>
          <dt className="text-base text-muted-foreground">Connection</dt>
          <dd className="mt-1.5">
            <ConnectionLine connection={connection} />
          </dd>
        </div>
        <div>
          <dt className="text-base text-muted-foreground">What it can do</dt>
          <dd className="mt-1.5 text-base">
            Add a lead to the <strong className="font-semibold">mock</strong> CRM. That is the only
            action, and the only destination.
          </dd>
        </div>
      </dl>

      <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        AgentAxio can’t tell n8n from any other tool that uses an agent’s key, so “receiving
        requests” only means a request arrived with that key. It does not check that your workflow
        is healthy.
      </p>

      {connection.agents.length > 0 ? (
        <div className="mt-6 border-t border-border/60 pt-5">
          <h3 className="text-base font-medium">Agents that can connect</h3>
          <ul className="mt-3 divide-y divide-border/50">
            {connection.agents.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
              >
                <Link
                  href={`/dashboard/agents/${a.id}`}
                  className="text-base font-medium text-primary-text hover:underline"
                >
                  {a.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {a.environment} ·{" "}
                  {a.status === "suspended"
                    ? "switched off"
                    : a.hasActiveKey
                      ? "has an access key"
                      : "no access key"}{" "}
                  ·{" "}
                  {a.lastRequestAt !== null ? (
                    <time dateTime={a.lastRequestAt} title={formatDateTimeUtc(a.lastRequestAt)}>
                      last request {relativeTime(a.lastRequestAt)}
                    </time>
                  ) : (
                    "no requests yet"
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-display text-base font-semibold"
      >
        {n}
      </span>
      <div className="min-w-0 pb-1">
        <h3 className="text-lg font-medium">{title}</h3>
        <div className="mt-1.5 space-y-2 text-base leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </li>
  );
}

export function SetupSteps({
  agentApiUrl,
  urlIsDefault,
}: {
  agentApiUrl: string;
  urlIsDefault: boolean;
}) {
  return (
    <ol className="space-y-6">
      <Step n={1} title="Create an agent and its access key">
        <p>
          Under{" "}
          <Link className="font-medium text-primary-text hover:underline" href="/dashboard/agents">
            My Agents
          </Link>
          , add an agent, open it and choose “Create a new access key”. The key is shown{" "}
          <strong className="font-semibold text-foreground">once</strong>: copy it straight into n8n
          (step 3).
        </p>
      </Step>
      <Step n={2} title="Say what the agent may do">
        <p>
          Under{" "}
          <Link
            className="font-medium text-primary-text hover:underline"
            href="/dashboard/policies"
          >
            Permissions
          </Link>
          , add a rule for the agent. “Needs a person’s approval” shows the full path. With no rule,
          every request is blocked.
        </p>
      </Step>
      <Step n={3} title="Store the key in n8n">
        <p>
          In n8n open <em>Credentials → Create credential → Header Auth</em> and enter:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Name: <Code>Authorization</Code>
          </li>
          <li>
            Value: <Code>Bearer</Code> followed by a space and the key
          </li>
          <li>
            Credential name: <Code>AgentAxio agent key</Code>
          </li>
        </ul>
        <p>
          This is the only secret n8n holds. Never put a CRM or other tool’s own credentials in the
          workflow: AgentAxio’s executor holds those.
        </p>
      </Step>
      <Step n={4} title="Import the example workflow">
        <p>
          <a
            href={WORKFLOW_FILE}
            download
            className="inline-flex items-center gap-1.5 font-medium text-primary-text hover:underline"
          >
            <Download className="size-4" aria-hidden="true" />
            Download the example workflow
          </a>
          , then in n8n choose <em>Import from file</em>. Open the two “AgentAxio” request steps and
          pick the credential from step 3.
        </p>
        <p>
          In the <Code>Proposed lead</Code> step, set <Code>agentaxio_url</Code> to this address
          {urlIsDefault ? " (the local default; change it if AgentAxio runs elsewhere)" : ""}:
        </p>
        <p>
          <Code>{agentApiUrl}</Code>
        </p>
        <p>
          n8n must be able to reach that address. The example sends an Idempotency-Key that stays
          the same if n8n retries, so a retry never creates a second request.
        </p>
      </Step>
    </ol>
  );
}

const EXPECTED = [
  [
    "Run the workflow in n8n",
    "It asks AgentAxio and waits. With a “needs approval” rule, nothing has been created yet.",
  ],
  [
    "Open Approvals here",
    "You see the request with the exact lead details. Approve it as someone other than the agent’s owner, the person who set it up, or the person who wrote its rule.",
  ],
  [
    "Back in n8n",
    "Within a few seconds the workflow ends with status “succeeded”. Activity here shows Completed.",
  ],
] as const;

const TROUBLE = [
  [
    "401",
    "The key is wrong, was replaced or was revoked. Create a new key and update the n8n credential.",
  ],
  [
    "403 with status “denied”",
    "A rule blocked it, or no rule covers the agent. This is the designed answer, not an error.",
  ],
  ["403 “agent suspended”", "The agent is switched off. Resume it under My Agents."],
  [
    "422",
    "The request didn’t match the allowed shape. The example workflow sends exactly the right shape.",
  ],
  ["429", "Too many requests in a minute. Wait and run it again."],
  [
    "No answer / can’t connect",
    "AgentAxio isn’t reachable. The workflow stops and nothing is done: it fails closed.",
  ],
] as const;

export function TestGuide() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-lg font-medium">Try it</h3>
        <ol className="mt-3 space-y-3">
          {EXPECTED.map(([title, text], i) => (
            <li key={title} className="text-base leading-relaxed">
              <span className="font-medium">
                {i + 1}. {title}.
              </span>{" "}
              <span className="text-muted-foreground">{text}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">
          Approving gives permission once. The lead appears in the mock CRM only after AgentAxio’s
          executor has acted, and only “Completed” means it did.
        </p>
      </div>
      <div>
        <h3 className="text-lg font-medium">If something looks wrong</h3>
        <dl className="mt-3 space-y-3">
          {TROUBLE.map(([code, text]) => (
            <div key={code} className="text-base leading-relaxed">
              <dt className="inline font-medium">{code}: </dt>
              <dd className="inline text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
