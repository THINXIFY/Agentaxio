import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDocument,
  ReviewFlag,
  type LegalSection,
} from "@/components/marketing/site/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy (draft)",
  description:
    "A draft privacy policy for the AgentAxio pre-release website. Not reviewed and not in effect.",
};

const SECTIONS: readonly LegalSection[] = [
  {
    id: "status",
    title: "Status of this document",
    body: (
      <p>
        This is a working draft for the AgentAxio pre-release website and demo dashboard. It has not
        been reviewed by a lawyer, it is not in effect, and it creates no rights or obligations. It
        will be replaced by a reviewed policy before any account, payment or real data is accepted.
      </p>
    ),
  },
  {
    id: "who",
    title: "Who is responsible",
    body: (
      <p>
        The organization responsible for this website is <ReviewFlag>legal entity name</ReviewFlag>,
        located at <ReviewFlag>registered address</ReviewFlag>. Contact for privacy questions:{" "}
        <ReviewFlag>privacy contact address</ReviewFlag>. None of these details have been decided,
        so none are stated here.
      </p>
    ),
  },
  {
    id: "today",
    title: "What the website does today",
    body: (
      <>
        <p>As built at the time of drafting, this website and the demo dashboard:</p>
        <ul>
          <li>
            have no accounts, sign-in or payments, and do not ask you to enter personal data to
            browse;
          </li>
          <li>
            keep your Light, Dark or System theme choice in your own browser’s local storage, and
            nowhere else;
          </li>
          <li>
            show only invented sample data in the demo. Nothing you do in the demo is sent anywhere;
          </li>
          <li>
            offer a contact form that is <strong>not connected</strong> to anything: what you type
            stays in your browser and is not transmitted;
          </li>
          <li>
            do not include analytics, advertising or other third-party tracking scripts{" "}
            <ReviewFlag>confirm again before publication that none have been added</ReviewFlag>.
          </li>
        </ul>
        <p>
          Whoever hosts the site may create ordinary server logs, such as IP addresses and request
          times.{" "}
          <ReviewFlag>hosting provider, region and log retention are not yet chosen</ReviewFlag>.
        </p>
      </>
    ),
  },
  {
    id: "future",
    title: "What may be collected once the product exists",
    body: (
      <>
        <p>
          Not yet built. When accounts and the control layer exist, the service is expected to
          handle account and sign-in details, agent names and credentials (stored hashed), the
          values of actions agents propose, approval decisions and an activity history.
        </p>
        <p>
          Purposes, legal bases, retention periods, processors, regions and international transfers
          are undecided:{" "}
          <ReviewFlag>
            all of this needs to be decided and written up by the founders with legal advice
          </ReviewFlag>
          .
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your rights and choices",
    body: (
      <p>
        Because the website collects no personal data today, there is nothing to access or delete
        beyond clearing your own browser’s storage. The rights that will apply once data is
        collected depend on where it is processed and where you live:{" "}
        <ReviewFlag>to be written with legal advice</ReviewFlag>.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        The intended security design is described on the{" "}
        <Link
          href="/security"
          className="font-medium text-primary-text underline underline-offset-4"
        >
          Security page
        </Link>
        . It describes intent and the current state, not a guarantee, and most of it is not built
        yet.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        This draft will change. Contact details for privacy requests will be published here once
        they exist: <ReviewFlag>privacy contact address</ReviewFlag>.
      </p>
    ),
  },
];

const REVIEW_ITEMS = [
  "Name, registered address and contact details of the responsible organization",
  "Whether any analytics, fonts, embeds or other third-party requests exist at launch (none today)",
  "Hosting provider, region and server-log retention",
  "What data the real service will collect, why, on what legal basis, for how long, and where it is stored",
  "Processors and sub-processors, and any international transfers",
  "Rights statements appropriate to the regions you will serve",
  "Cookie and local-storage wording, if anything beyond the theme preference is ever added",
  "Children’s data position, and whether a data protection officer or representative is required",
] as const;

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      lead="How the AgentAxio pre-release website treats information today, and what still has to be decided before the real product handles any."
      updated="20 Oct 2026"
      sections={SECTIONS}
      reviewItems={REVIEW_ITEMS}
    />
  );
}
