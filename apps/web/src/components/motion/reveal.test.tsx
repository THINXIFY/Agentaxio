import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "@/components/motion/reveal";
import { useGsapEffect, type GsapApi } from "@/lib/gsap";

/** Minimal matchMedia stub: `reduced` controls prefers-reduced-motion. */
function stubMatchMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string): MediaQueryList => {
    // Both queries contain "reduce" (prefers-reduced-motion), so key on the value.
    const isNoPreferenceQuery = query.includes("no-preference");
    return {
      matches: isNoPreferenceQuery ? !reduced : reduced,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

describe("Reveal", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.motionReady;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows content immediately under reduced motion and never arms the animation", async () => {
    stubMatchMedia(true);
    render(<Reveal>Hello</Reveal>);
    const el = screen.getByText("Hello");
    expect(el).toBeVisible();
    expect(el).toHaveAttribute("data-revealed");
    // Give a (non-existent) lazy GSAP load time to run: it must not.
    await new Promise((r) => setTimeout(r, 400));
    expect(document.documentElement.dataset.motionReady).toBeUndefined();
  });

  it("arms the animation after GSAP loads lazily when motion is allowed", async () => {
    stubMatchMedia(false);
    render(<Reveal>Hello</Reveal>);
    const el = screen.getByText("Hello");
    expect(el).toHaveAttribute("data-reveal");
    expect(el).not.toHaveAttribute("data-revealed");
    await waitFor(() => expect(document.documentElement.dataset.motionReady).toBe("true"), {
      timeout: 5000,
    });
    expect(el).not.toHaveAttribute("data-revealed");
  });
});

describe("useGsapEffect (lazy GSAP contract)", () => {
  function Probe({
    setup,
    prepare,
  }: {
    setup: (api: GsapApi) => void | (() => void);
    prepare?: () => boolean;
  }) {
    useGsapEffect(setup, prepare);
    return null;
  }

  beforeEach(() => stubMatchMedia(false));
  afterEach(() => vi.unstubAllGlobals());

  it("runs setup with the loaded API, then its cleanup on unmount", async () => {
    const cleanup = vi.fn();
    const setup = vi.fn((api: GsapApi) => {
      expect(typeof api.gsap.to).toBe("function");
      expect(typeof api.ScrollTrigger.create).toBe("function");
      return cleanup;
    });
    const { unmount } = render(<Probe setup={setup} />);
    expect(setup).not.toHaveBeenCalled(); // not synchronous: GSAP is not in the initial bundle
    await waitFor(() => expect(setup).toHaveBeenCalledTimes(1), { timeout: 5000 });
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("never runs setup if unmounted before GSAP arrives", async () => {
    const setup = vi.fn();
    const { unmount } = render(<Probe setup={setup} />);
    unmount();
    await new Promise((r) => setTimeout(r, 600));
    expect(setup).not.toHaveBeenCalled();
  });

  it("skips loading entirely when prepare() reports the static end state was applied", async () => {
    const setup = vi.fn();
    render(<Probe setup={setup} prepare={() => true} />);
    await new Promise((r) => setTimeout(r, 400));
    expect(setup).not.toHaveBeenCalled();
  });
});
