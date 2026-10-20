import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { Callout } from "@/components/marketing/site/callout";
import { ContactForm } from "@/components/marketing/site/contact-form";
import { PageHero } from "@/components/marketing/site/page-hero";
import { StatusPill, type Availability } from "@/components/marketing/site/status-pill";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "AgentAxio is pre-release. This page lists the contact options that exist today and the ones that will be published before launch.",
};

const REPO_URL = "https://github.com/THINXIFY/Agentaxio";

const OPTIONS: ReadonlyArray<{
  title: string;
  text: string;
  status: Availability;
  label: string;
}> = [
  {
    title: "The message form",
    text: "Validates your message, but isn’t connected to anything yet, so nothing can be sent from it.",
    status: "planned",
    label: "Not connected yet",
  },
  {
    title: "Email",
    text: "A contact address will be published before launch.",
    status: "planned",
    label: "Not published yet",
  },
  {
    title: "Security reports",
    text: "A disclosure process and contact will be published before any private beta.",
    status: "planned",
    label: "Not published yet",
  },
  {
    title: "Early access",
    text: "There is no waitlist or sign-up yet. We will say so here when there is.",
    status: "planned",
    label: "Not open",
  },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        layout="center"
        eyebrow="Contact"
        title="Get in touch."
        lead="AgentAxio is pre-release, so the ways to reach us are limited. This page is honest about which ones work today."
        status={<StatusPill status="planned" label="Contact form: not connected yet" />}
      />

      <Section tone="light" aria-labelledby="contact-title" className="py-16 sm:py-24">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <h2 id="contact-title" className="font-display text-2xl font-semibold tracking-tight">
              Ways to reach us
            </h2>
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {OPTIONS.map((o) => (
                <li key={o.title} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-medium">{o.title}</p>
                    <StatusPill status={o.status} label={o.label} />
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{o.text}</p>
                </li>
              ))}
              <li className="py-4">
                <p className="text-base font-medium">Follow the build</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  The project’s source code and design documents are public.
                </p>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary-text underline underline-offset-4"
                >
                  Open the project on GitHub
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            </ul>
            <div className="mt-6">
              <Callout tone="review" title="Needs founder input before launch">
                A real contact address, a security contact and a response expectation have to be
                chosen before this page can offer them.
              </Callout>
            </div>
          </Reveal>

          <Reveal y={32} delay={0.08} className="lg:col-span-7">
            <div className="rounded-card border border-border bg-surface p-6 shadow-raised sm:p-8">
              <h2 className="font-display text-2xl font-semibold tracking-tight">Send a message</h2>
              <p className="mt-2 mb-6 text-base text-muted-foreground">
                Tell us what your agents do and what you would want to control.
              </p>
              <ContactForm />
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
