import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <Text variant="muted" className="font-mono">
        404
      </Text>
      <Heading level={1} size="display-md">
        Page not found
      </Heading>
      <Text variant="muted">That page doesn’t exist, or hasn’t been built yet.</Text>
      <Button asChild>
        <Link href="/">Back to start</Link>
      </Button>
    </main>
  );
}
