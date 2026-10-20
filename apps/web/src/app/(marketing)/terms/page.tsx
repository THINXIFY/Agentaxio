import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDocument,
  ReviewFlag,
  type LegalSection,
} from "@/components/marketing/site/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service (draft)",
  description:
    "Draft terms for using the AgentAxio pre-release website and demo dashboard. Not reviewed and not in effect.",
};

const SECTIONS: readonly LegalSection[] = [
  {
    id: "status",
    title: "Status of this document",
    body: (
      <p>
        This is a working draft. It has not been reviewed by a lawyer, it is not in effect, and it
        creates no legal commitments. Final terms will be published, and accepted where required,
        before any account, payment or real data is involved.
      </p>
    ),
  },
  {
    id: "service",
    title: "What the service is today",
    body: (
      <>
        <p>
          AgentAxio is pre-release. What exists is this website and a demo dashboard that run on
          invented sample data.
        </p>
        <ul>
          <li>There are no accounts, and no real agents, permissions or approvals.</li>
          <li>
            Nothing in the demo enforces, approves, executes or blocks anything, and no integration
            is connected.
          </li>
          <li>
            Plans, prices, service levels and support have not been decided and are not offered.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "Using the website and demo",
    body: (
      <p>
        You may browse the website and use the demo to see how AgentAxio is intended to work. Please
        don’t attempt to disrupt the site or use it to harm others.{" "}
        <ReviewFlag>acceptable-use wording to be written with legal advice</ReviewFlag>
      </p>
    ),
  },
  {
    id: "no-reliance",
    title: "No reliance",
    body: (
      <p>
        Everything shown is for illustration. Do not rely on it as security, legal or compliance
        advice, or as evidence that any agent or tool is protected. The{" "}
        <Link
          href="/security"
          className="font-medium text-primary-text underline underline-offset-4"
        >
          Security page
        </Link>{" "}
        says what is built and what is only designed.{" "}
        <ReviewFlag>warranty and liability wording to be written with legal advice</ReviewFlag>
      </p>
    ),
  },
  {
    id: "ip",
    title: "Ownership of the content",
    body: (
      <p>
        The website’s text, design and code are owned by the project’s owners.{" "}
        <ReviewFlag>owner name and licence position to be confirmed</ReviewFlag>
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <p>
        <ReviewFlag>governing law and the place disputes are heard have not been chosen</ReviewFlag>
      </p>
    ),
  },
  {
    id: "contact",
    title: "Changes and contact",
    body: (
      <p>
        These terms will change as the product does. A contact address for legal notices will be
        published here: <ReviewFlag>legal contact address</ReviewFlag>.
      </p>
    ),
  },
];

const REVIEW_ITEMS = [
  "Name and registration details of the contracting organization",
  "Terms for real accounts: eligibility, acceptable use for agents, responsibility for what agents do, and suspension",
  "Disclaimers, limitations of liability and indemnities, for each region you will serve",
  "Paid plans, billing, refunds and cancellation, once pricing exists",
  "Service levels, support and uptime commitments (none are offered today)",
  "Data processing terms for customers whose agents handle personal data",
  "Governing law, jurisdiction and dispute process",
  "Ownership of customer data and licences granted to AgentAxio",
] as const;

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      lead="Draft terms for the AgentAxio pre-release website and demo dashboard, and a list of what must be decided before real terms exist."
      updated="20 Oct 2026"
      sections={SECTIONS}
      reviewItems={REVIEW_ITEMS}
    />
  );
}
