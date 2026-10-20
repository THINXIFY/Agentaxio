import * as React from "react";
import { FileWarning } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Callout } from "@/components/marketing/site/callout";
import { PageHero } from "@/components/marketing/site/page-hero";
import { StatusPill } from "@/components/marketing/site/status-pill";
import { MonoLabel } from "@/components/marketing/site/blocks";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/**
 * Inline marker for a fact that is not known yet. Draft legal text must never invent company details, addresses or
 * commitments, so each gap is flagged for founder or legal review instead.
 */
export function ReviewFlag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-baseline gap-1.5 rounded-sm border border-warning-border bg-warning-muted px-1.5 py-0.5 align-baseline text-[0.85em] font-medium text-warning-text">
      <FileWarning className="size-3.5 translate-y-0.5 self-center" aria-hidden="true" />
      <span>
        <span className="sr-only">Needs founder or legal review: </span>
        {children}
      </span>
    </span>
  );
}

/** A draft legal page: clear banner, table of contents, numbered sections and a review checklist. */
export function LegalDocument({
  title,
  lead,
  updated,
  sections,
  reviewItems,
}: {
  title: string;
  lead: string;
  updated: string;
  sections: readonly LegalSection[];
  /** Everything that must be decided or checked before this page may be published as final. */
  reviewItems: readonly string[];
}) {
  return (
    <>
      <PageHero
        layout="wide"
        eyebrow="Legal · draft"
        title={title}
        lead={lead}
        status={
          <>
            <StatusPill status="draft" label="Draft · not reviewed · not in effect" />
            <StatusPill status="planned" label={`Last drafted ${updated}`} />
          </>
        }
      />

      <Section tone="light" aria-label={`${title}, full text`} className="py-16 sm:py-24">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <nav aria-label="On this page" className="lg:col-span-3">
            <div className="lg:sticky lg:top-24">
              <MonoLabel>Contents</MonoLabel>
              <ol className="mt-4 space-y-2 text-sm">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex gap-2.5 py-1 text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      <span className="font-mono text-xs text-primary-text" aria-hidden="true">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {s.title}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href="#review"
                    className="flex gap-2.5 py-1 font-medium text-warning-text transition-colors duration-200 hover:underline"
                  >
                    <span className="font-mono text-xs" aria-hidden="true">
                      !
                    </span>
                    Before publication
                  </a>
                </li>
              </ol>
            </div>
          </nav>

          <div className="space-y-12 lg:col-span-9">
            <Callout tone="review" title="This is a draft, not a legal document in force">
              It has not been reviewed by a lawyer and does not bind anyone. It describes the
              pre-release website as it behaves today. Highlighted gaps must be filled in by the
              founders, and the whole text reviewed, before publication.
            </Callout>

            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                aria-labelledby={`${s.id}-title`}
                className="scroll-mt-24"
              >
                <h2
                  id={`${s.id}-title`}
                  className="flex items-baseline gap-3 font-display text-2xl font-semibold tracking-tight"
                >
                  <span className="font-mono text-sm text-primary-text" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </h2>
                <div className="mt-4 max-w-3xl space-y-4 text-base leading-relaxed [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
                  {s.body}
                </div>
              </section>
            ))}

            <section
              id="review"
              aria-labelledby="review-title"
              className="scroll-mt-24 border-t border-border pt-10"
            >
              <h2 id="review-title" className="font-display text-2xl font-semibold tracking-tight">
                Before publication: needs founder or legal review
              </h2>
              <ul className="mt-5 max-w-3xl list-disc space-y-2.5 pl-6 text-base leading-relaxed">
                {reviewItems.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          </div>
        </Container>
      </Section>
    </>
  );
}
