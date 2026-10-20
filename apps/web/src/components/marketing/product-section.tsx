import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { ProductPreview } from "@/components/marketing/product-preview";
import { Reveal } from "@/components/motion/reveal";
import { TiltIn } from "@/components/motion/tilt-in";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { HOME_SECTION_IDS } from "@/config/navigation";

export function ProductSection() {
  return (
    <Section
      id={HOME_SECTION_IDS.product}
      tone="light"
      aria-labelledby="product-title"
      className="relative z-10 -mt-5 rounded-t-panel"
    >
      <Container>
        <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Eyebrow>Product overview</Eyebrow>
            <Heading id="product-title" level={2} size="display-md" className="mt-5">
              See every request, from proposal to outcome.
            </Heading>
          </div>
          <Text variant="lead" className="lg:col-span-5 lg:pb-2">
            Select a sample request to see what the agent proposed, how policy decided, and what
            happened next. Every record here is invented.
          </Text>
        </Reveal>

        <TiltIn className="mt-14">
          <ProductPreview />
        </TiltIn>
      </Container>
    </Section>
  );
}
