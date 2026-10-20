import * as React from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { ActionRequestStatusBadge, AgentStatusBadge } from "@/components/domain/status-badge";
import { Container } from "@/components/layout/container";
import { RevealStagger } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Separator, Skeleton } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { Code, Eyebrow, Heading, Kbd, Text } from "@/components/ui/typography";
import { ACTION_REQUEST_STATUSES } from "@/lib/contracts";

/** Static class names so Tailwind can see them. */
const SWATCHES: ReadonlyArray<{ name: string; swatch: string }> = [
  { name: "background", swatch: "bg-background" },
  { name: "surface", swatch: "bg-surface" },
  { name: "surface-sunken", swatch: "bg-surface-sunken" },
  { name: "foreground", swatch: "bg-foreground" },
  { name: "muted-foreground", swatch: "bg-muted-foreground" },
  { name: "primary", swatch: "bg-primary" },
  { name: "accent", swatch: "bg-accent" },
  { name: "subtle", swatch: "bg-subtle" },
  { name: "border-strong", swatch: "bg-border-strong" },
  { name: "success", swatch: "bg-success" },
  { name: "warning", swatch: "bg-warning" },
  { name: "danger", swatch: "bg-danger" },
  { name: "info", swatch: "bg-info" },
];

function DocSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border py-12">
      <Heading id={id} level={2} size="display-sm">
        {title}
      </Heading>
      {description ? (
        <Text variant="muted" className="mt-2 max-w-2xl">
          {description}
        </Text>
      ) : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function PalettePanel({ tone, label }: { tone: "surface-light" | "surface-dark"; label: string }) {
  return (
    <div className={`${tone} rounded-panel border border-border p-6`}>
      <p className="font-display text-lg font-semibold">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Forced palette, independent of the Light/Dark/System setting.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SWATCHES.map(({ name, swatch }) => (
          <div key={name} className="space-y-1.5">
            <div className={`${swatch} h-10 rounded-control border border-border-strong`} />
            <p className="font-mono text-[0.7rem] text-muted-foreground">{name}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <Container className="pb-24">
      <div className="py-12">
        <Eyebrow>Foundation</Eyebrow>
        <Heading level={1} size="display-lg" className="mt-3">
          Obsidian Black × Midnight Violet
        </Heading>
        <Text variant="lead" className="mt-4 max-w-2xl">
          Token-based, themeable and accessible. Components use semantic roles only; palettes are
          defined once in <Code>styles/tokens.css</Code>.
        </Text>
      </div>

      <DocSection
        id="palettes"
        title="Palettes"
        description="Light and dark palettes side by side. Marketing pages mix them per section with the .surface-light / .surface-dark scopes."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <PalettePanel tone="surface-light" label="Light — arctic white / deep ink" />
          <PalettePanel tone="surface-dark" label="Dark — obsidian / midnight navy" />
        </div>
      </DocSection>

      <DocSection
        id="typography"
        title="Typography"
        description="Space Grotesk for display headings; Geist for the interface; Geist Mono for identifiers and code."
      >
        <div className="space-y-6">
          <Heading level={3} size="display-xl">
            Display XL
          </Heading>
          <Heading level={3} size="display-lg">
            Display large heading
          </Heading>
          <Heading level={3} size="display-md">
            Display medium heading
          </Heading>
          <Heading level={3} size="display-sm">
            Display small heading
          </Heading>
          <Separator />
          <Heading level={3} size="xl">
            Interface heading XL
          </Heading>
          <Text variant="lead">
            Lead paragraph: larger supporting copy for introductions and section summaries.
          </Text>
          <Text>
            Body text uses Geist at a comfortable measure with relaxed leading. Inline{" "}
            <Code>code</Code> and <Kbd>⌘</Kbd> <Kbd>K</Kbd> keys are styled consistently.
          </Text>
          <Text variant="muted">Muted text for secondary information and hints.</Text>
        </div>
      </DocSection>

      <DocSection
        id="buttons"
        title="Buttons"
        description="Primary actions are Electric Violet with obsidian text (4.8:1). Violet is a fill: used as text or icons it switches to soft lavender on dark and deep violet on light (the primary-text role). Statuses never rely on violet: info is a cyan-blue, plus text and icons."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">
            <Trash2 aria-hidden="true" /> Revoke
          </Button>
          <Button variant="link">Link style</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">
            Large <ArrowRight aria-hidden="true" />
          </Button>
          <Button size="icon" aria-label="Add">
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </DocSection>

      <DocSection
        id="status"
        title="Badges and status"
        description="Status is always text plus an icon, never colour alone. “Approved” is deliberately distinct from “Executed”."
      >
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="info">Info</Badge>
        </div>
        <p className="mt-6 mb-3 text-sm font-medium">
          Action request statuses (from the API contract)
        </p>
        <div className="flex flex-wrap gap-2">
          {ACTION_REQUEST_STATUSES.map((s) => (
            <ActionRequestStatusBadge key={s} status={s} />
          ))}
        </div>
        <p className="mt-6 mb-3 text-sm font-medium">Agent statuses</p>
        <div className="flex flex-wrap gap-2">
          <AgentStatusBadge status="active" />
          <AgentStatusBadge status="suspended" />
        </div>
      </DocSection>

      <DocSection
        id="forms"
        title="Forms"
        description="Label, hint and error are wired with aria-describedby / aria-invalid automatically."
      >
        <form className="grid max-w-3xl gap-6 sm:grid-cols-2" aria-label="Form examples">
          <Field label="Agent name" hint="Shown in the approval inbox." required>
            <Input name="name" placeholder="Lead Intake Agent" />
          </Field>
          <Field label="Contact email" error="Enter a valid email address." required>
            <Input name="email" type="email" defaultValue="not-an-email" />
          </Field>
          <Field label="Environment">
            <Select name="environment" defaultValue="dev">
              <option value="dev">dev</option>
              <option value="staging">staging</option>
              <option value="prod">prod</option>
            </Select>
          </Field>
          <Field label="Disabled field">
            <Input name="disabled" disabled defaultValue="Read only" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea name="description" placeholder="What is this agent allowed to propose?" />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch aria-label="Notify approvers by email" defaultChecked />
            <span className="text-sm">Notify approvers by email</span>
          </div>
        </form>
      </DocSection>

      <DocSection
        id="cards"
        title="Cards"
        description="Four surface treatments for the dashboard and marketing sections."
      >
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Default</CardTitle>
              <CardDescription>Bordered surface for dense dashboard content.</CardDescription>
            </CardHeader>
            <CardContent>
              <Text variant="small">Used for lists, tables and settings groups.</Text>
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">
                Action
              </Button>
            </CardFooter>
          </Card>
          <Card variant="raised" padding="md">
            <CardTitle>Raised</CardTitle>
            <CardDescription className="mt-1.5">
              Elevated card for feature highlights on light sections.
            </CardDescription>
          </Card>
          <div className="surface-dark bg-wash rounded-panel p-6">
            <Card variant="glass" padding="md">
              <CardTitle>Glass</CardTitle>
              <CardDescription className="mt-1.5">
                Translucent panel for cinematic dark sections.
              </CardDescription>
            </Card>
          </div>
        </div>
      </DocSection>

      <DocSection
        id="table"
        title="Table"
        description="Labelled, keyboard-scrollable region for small screens."
      >
        <Table label="Example table">
          <TableHead>
            <tr>
              <TableHeaderCell>Agent</TableHeaderCell>
              <TableHeaderCell>Environment</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Lead Intake Agent</TableCell>
              <TableCell>
                <Badge className="font-mono">dev</Badge>
              </TableCell>
              <TableCell>
                <AgentStatusBadge status="active" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Legacy Import Agent</TableCell>
              <TableCell>
                <Badge className="font-mono">staging</Badge>
              </TableCell>
              <TableCell>
                <AgentStatusBadge status="suspended" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div className="mt-6 space-y-2" role="status" aria-busy="true">
          <span className="sr-only">Loading example</span>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </DocSection>

      <DocSection
        id="motion"
        title="Motion (GSAP)"
        description="Scroll-triggered entrance via ScrollTrigger inside gsap.matchMedia(). With prefers-reduced-motion, or without JavaScript, content is simply visible."
      >
        <RevealStagger className="grid gap-4 sm:grid-cols-3">
          {["Scoped identity", "Deterministic policy", "Human approval"].map((label) => (
            <Card key={label} variant="raised" padding="md" data-reveal-item="">
              <p className="font-display text-lg font-semibold">{label}</p>
              <p className="mt-1 text-sm text-muted-foreground">Staggered reveal item</p>
            </Card>
          ))}
        </RevealStagger>
      </DocSection>
    </Container>
  );
}
