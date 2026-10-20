"use client";

import * as React from "react";
import { Copy } from "lucide-react";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { HelpTip } from "@/components/dashboard/help-tip";
import { useToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GLOSSARY } from "@/lib/plain-language";
import type { DashboardAgent } from "@/mocks/dashboard";

/**
 * An agent's credential at a glance. Only the visible PREFIX is shown or copyable: real secrets are revealed once at
 * creation and stored hashed, so the browser never holds one.
 */
export function CredentialPreview({ agent }: { agent: DashboardAgent }) {
  const toast = useToast();

  const copyPrefix = async () => {
    try {
      await navigator.clipboard.writeText(agent.credentialPrefix);
      toast({
        title: "Preview copied",
        description: `${agent.credentialPrefix} is a sample value. Real secrets are shown once and never kept in the browser.`,
      });
    } catch {
      toast({
        title: "Couldn’t copy",
        description: "Your browser blocked clipboard access.",
        tone: "warning",
      });
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className="text-base text-muted-foreground">Access key (preview only)</p>
        <HelpTip term="Access key">{GLOSSARY.credential}</HelpTip>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 rounded-control bg-surface-sunken px-4 py-3">
        <p className="min-w-0 truncate font-mono text-base">{agent.credentialPrefix}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={copyPrefix}
              aria-label={`Copy access key preview for ${agent.name}`}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
            >
              <Copy className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Copy preview</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/** Compact identity card for the Agent identities page: name, purpose and the credential preview. */
export function AgentIdentityCard({
  agent,
  headingLevel = 2,
}: {
  agent: DashboardAgent;
  /** 2 when the card sits directly under the page h1. */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article
      aria-label={`${agent.name} identity`}
      className="flex min-w-0 flex-col rounded-card border border-border/60 bg-surface p-6 transition-colors duration-200 ease-standard hover:bg-surface-hover"
    >
      <header className="flex items-center gap-4">
        <AgentAvatar name={agent.name} className="size-11 text-sm" />
        <div className="min-w-0">
          <Heading className="text-lg font-medium">{agent.name}</Heading>
          <p className="text-base text-muted-foreground">
            {agent.environment} · {agent.owner}
          </p>
        </div>
      </header>
      <div className="mt-5">
        <CredentialPreview agent={agent} />
      </div>
    </article>
  );
}
