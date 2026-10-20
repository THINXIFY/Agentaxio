"use client";

import * as React from "react";
import { CircleAlert, Copy, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

/**
 * Contact form for the pre-release site. There is NO backend, so the form validates and then says plainly that nothing
 * was sent. It never shows a success state, never makes a network request, and keeps the visitor's text so it can be
 * copied or edited. When a real channel exists, only the "unavailable" branch needs to change.
 */

type Values = { topic: string; name: string; email: string; organization: string; message: string };
type Errors = Partial<Record<keyof Values, string>>;

const TOPICS = [
  "A general question",
  "I run agents or n8n workflows and want to talk",
  "Pricing or plans",
  "Partnership or press",
  "Something else",
] as const;

const EMPTY: Values = {
  topic: TOPICS[0],
  name: "",
  email: "",
  organization: "",
  message: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE = 20;

export function validate(v: Values): Errors {
  const errors: Errors = {};
  if (v.name.trim().length < 2) errors.name = "Enter your name.";
  if (!EMAIL.test(v.email.trim())) errors.email = "Enter an email address like name@example.com.";
  if (v.message.trim().length < MIN_MESSAGE)
    errors.message = `Write at least ${MIN_MESSAGE} characters so we understand what you need.`;
  return errors;
}

export function ContactForm() {
  const [values, setValues] = React.useState<Values>(EMPTY);
  const [errors, setErrors] = React.useState<Errors>({});
  const [phase, setPhase] = React.useState<"editing" | "unavailable">("editing");
  const [copied, setCopied] = React.useState<"idle" | "copied" | "blocked">("idle");
  const summaryRef = React.useRef<HTMLDivElement>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);

  const set =
    (key: keyof Values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Move focus to the summary so keyboard and screen-reader users hear what to fix.
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setPhase("unavailable");
    requestAnimationFrame(() => noticeRef.current?.focus());
  };

  const copy = async () => {
    const text = [
      `Topic: ${values.topic}`,
      `Name: ${values.name}`,
      `Email: ${values.email}`,
      values.organization ? `Organization: ${values.organization}` : null,
      "",
      values.message,
    ]
      .filter((l) => l !== null)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("blocked");
    }
  };

  if (phase === "unavailable") {
    return (
      <div
        ref={noticeRef}
        tabIndex={-1}
        role="status"
        className="rounded-card border border-warning-border bg-warning-muted/50 p-6 outline-none sm:p-8"
      >
        <p className="flex items-center gap-2.5 text-lg font-semibold text-warning-text">
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          This form isn’t connected yet. Nothing was sent.
        </p>
        <p className="mt-3 text-base leading-relaxed text-foreground/90">
          AgentAxio is pre-release and has no way to receive messages. Your text is still here, so
          you can copy it and send it once a contact address is published.
        </p>
        <pre className="mt-5 max-h-64 overflow-auto rounded-control border border-border bg-background p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
          {values.message}
        </pre>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={copy}>
            <Copy aria-hidden="true" /> Copy my message
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPhase("editing")}>
            <PencilLine aria-hidden="true" /> Edit message
          </Button>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {copied === "copied" ? "Copied to your clipboard." : null}
            {copied === "blocked"
              ? "Your browser blocked copying. Select the text and copy it."
              : null}
          </p>
        </div>
      </div>
    );
  }

  const errorEntries = Object.entries(errors) as Array<[keyof Values, string]>;

  return (
    <form noValidate onSubmit={submit} className="space-y-5" aria-describedby="contact-state">
      <p
        id="contact-state"
        className="rounded-control border border-border bg-surface-sunken p-4 text-sm leading-relaxed text-muted-foreground"
      >
        <strong className="font-semibold text-foreground">Pre-release:</strong> this form isn’t
        connected to anything yet. You can fill it in to see how it will work, but nothing will be
        sent.
      </p>

      {errorEntries.length > 0 ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-control border border-danger-border bg-danger-muted/60 p-4 text-sm outline-none"
        >
          <p className="font-semibold text-danger-text">
            Please fix {errorEntries.length === 1 ? "this" : "these"} before continuing:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errorEntries.map(([k, msg]) => (
              <li key={k}>{msg}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Field label="What is this about?">
        <Select value={values.topic} onChange={set("topic")}>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Your name" required error={errors.name}>
          <Input autoComplete="name" value={values.name} onChange={set("name")} />
        </Field>
        <Field label="Email" required error={errors.email}>
          <Input type="email" autoComplete="email" value={values.email} onChange={set("email")} />
        </Field>
      </div>

      <Field label="Organization" hint="Optional.">
        <Input
          autoComplete="organization"
          value={values.organization}
          onChange={set("organization")}
        />
      </Field>

      <Field
        label="Message"
        required
        hint="What do your agents do, and what would you want to control?"
        error={errors.message}
      >
        <Textarea rows={6} value={values.message} onChange={set("message")} />
      </Field>

      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Check my message
      </Button>
    </form>
  );
}
