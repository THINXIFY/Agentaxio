import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/planned-page";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <PlannedPage
      title="Billing"
      description="Your plan, your usage and your invoices."
      milestone="Commercial phase (docs/ROADMAP.md phase 9), built after the authorization core and private beta."
      willInclude={[
        "See the current plan and how much of it has been used.",
        "Manage payment details and download invoices.",
        "Receive usage notifications before a limit is reached.",
      ]}
      note="Pricing has not been decided and billing is not live in the pre-release. Plans will meter usage and will never change how policy is evaluated."
    />
  );
}
