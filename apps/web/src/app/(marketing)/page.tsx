import type { Metadata } from "next";
import { CtaSection } from "@/components/marketing/cta-section";
import { DevelopersSection } from "@/components/marketing/developers-section";
import { FeaturesSection } from "@/components/marketing/features-section";
import { Hero } from "@/components/marketing/hero";
import { PlatformSection } from "@/components/marketing/platform-section";
import { PricingSection } from "@/components/marketing/pricing-section";
import { ProductSection } from "@/components/marketing/product-section";
import { WorkflowSection } from "@/components/marketing/workflow-section";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — AI Moves Fast. Stay in Control.` },
  description: siteConfig.description,
};

/**
 * FE-02 marketing homepage (redesign of FE-01). All product visuals use clearly labelled sample data;
 * nothing here connects to a backend. Section rhythm:
 * hero (dark) -> platform (soft white) -> features (dark) -> product (soft white, dark window) ->
 * workflow (dark) -> developers (charcoal) -> pricing preview (soft white) -> CTA + footer (dark).
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <PlatformSection />
      <FeaturesSection />
      <ProductSection />
      <WorkflowSection />
      <DevelopersSection />
      <PricingSection />
      <CtaSection />
    </>
  );
}
