"use client";

import * as React from "react";
import { Building2, CloudOff, LogIn } from "lucide-react";
import { ActionError, useApiAction } from "@/components/live/use-api-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";

/** Shown instead of a live page when there is no signed-in person yet. Sign-in itself happens at the identity provider. */
export function SignedOutPanel() {
  return (
    <EmptyState
      icon={<LogIn aria-hidden="true" />}
      title="Sign in to see your workspace"
      description="AgentAxio never sees your password: you sign in with your organization’s identity provider, and approvals ask for multi-factor authentication."
      action={
        <Button asChild>
          <a href="/api/auth/login?return_to=/dashboard">Sign in</a>
        </Button>
      }
    />
  );
}

export function UnreachablePanel() {
  return (
    <EmptyState
      icon={<CloudOff aria-hidden="true" />}
      title="Can’t reach the AgentAxio service"
      description="The local backend isn’t answering. Nothing has been changed. Check that it is running, then reload this page."
    />
  );
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** A signed-in person with no organization yet creates their first one (they become its owner). */
export function CreateOrganizationPanel() {
  const { run, pending, failure } = useApiAction();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);

  return (
    <div className="mx-auto max-w-xl rounded-card border border-border/60 bg-surface p-6 shadow-raised">
      <div className="mb-5 flex items-center gap-3">
        <Building2 aria-hidden="true" className="size-6 text-primary-text" />
        <h2 className="text-xl font-semibold">Create your organization</h2>
      </div>
      <p className="mb-6 text-base text-muted-foreground">
        You aren’t a member of any organization yet. Create one to set up agents and rules. You will
        be its owner. (If a colleague invited you, accept the invitation instead.)
      </p>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void run("/v1/organizations", { name: name.trim(), slug: slug || slugify(name) });
        }}
      >
        <Field label="Organization name" required>
          <Input
            value={name}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </Field>
        <Field label="Short name" hint="3 to 40 lowercase letters, digits or hyphens." required>
          <Input
            value={slug}
            maxLength={40}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </Field>
        <ActionError failure={failure} />
        <Button type="submit" loading={pending} disabled={name.trim() === "" || slug.length < 3}>
          Create organization
        </Button>
      </form>
    </div>
  );
}
