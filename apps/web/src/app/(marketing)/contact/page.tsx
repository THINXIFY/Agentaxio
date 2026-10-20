import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { ArtHero, Chapter, StatusMark, StatusStrip } from "@/components/marketing/art/chapter";
import { ContactForm } from "@/components/marketing/site/contact-form";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "AgentAxio is pre-release. This page lists the contact options that exist today and the ones that will be published before launch.",
};

const REPO_URL = "https://github.com/THINXIFY/Agentaxio";

const OPTIONS = [
  {
    title: "The message form",
    text: "Validates your message, but isn’t connected to anything yet, so nothing can be sent from it.",
    label: "Not connected yet",
  },
  {
    title: "Email",
    text: "A contact address will be published before launch.",
    label: "Not published yet",
  },
  {
    title: "Security reports",
    text: "A disclosure process and contact will be published before any private beta.",
    label: "Not published yet",
  },
  {
    title: "Early access",
    text: "There is no waitlist or sign-up yet. We will say so here when there is.",
    label: "Not open",
  },
] as const;

export default function ContactPage() {
  return (
    <>
      <ArtHero
        label="Contact"
        title="Tell us what your agents do."
        lead="AgentAxio is pre-release, so the ways to reach us are limited. This page is plain about which ones work today."
      >
        <StatusStrip kinds={["planned"]}>
          Contact form: not connected yet. Messages can’t be sent from this page until a channel is
          chosen.
        </StatusStrip>
      </ArtHero>

      <Chapter
        id="contact"
        index="01"
        label="Reach us"
        round
        wide
        title="Ways to reach us, and a form to try."
      >
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <ul className="border-t border-border">
              {OPTIONS.map((o) => (
                <li key={o.title} className="border-b border-border py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-medium">{o.title}</p>
                    <StatusMark status="planned" className="text-muted-foreground">
                      {o.label}
                    </StatusMark>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{o.text}</p>
                </li>
              ))}
              <li className="border-b border-border py-4">
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
            <p className="mt-6 border-l-2 border-warning-border pl-5 text-sm leading-relaxed">
              <strong className="font-semibold text-warning-text">
                Needs founder input before launch.
              </strong>{" "}
              <span className="text-muted-foreground">
                A real contact address, a security contact and a response expectation have to be
                chosen before this page can offer them.
              </span>
            </p>
          </Reveal>

          <Reveal y={32} delay={0.08} className="lg:col-span-7">
            <div className="border-t border-border-strong pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
              <h2 className="font-display text-xl font-semibold tracking-tight">Send a message</h2>
              <p className="mt-1.5 mb-6 text-base text-muted-foreground">
                What do your agents do, and what would you want to control?
              </p>
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </Chapter>
    </>
  );
}
