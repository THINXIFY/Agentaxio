import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Brand colours live in ONE place (styles/tokens.css). This guard fails if a component, stylesheet or config
 * file hardcodes a hex colour, so a future re-brand really is a one-file change.
 *
 * Allowed exceptions (browser APIs that cannot read CSS variables): config/theme-color.ts (<meta name="theme-color">).
 */

const SRC = join(__dirname, "..");
const ALLOWED = new Set(
  ["styles/tokens.css", "config/theme-color.ts"].map((p) => p.split("/").join(sep)),
);
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z-])/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("brand colour centralisation", () => {
  const files = walk(SRC).filter((f) => !ALLOWED.has(relative(SRC, f)));

  it("scans a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("has no hardcoded hex colours outside tokens.css", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      // `href="#main-content"` style anchors are not colours: only flag hex with at least one digit AND a-f/0-9 only.
      for (const match of text.matchAll(HEX)) {
        const value = match[0];
        if (/^#[a-zA-Z]+$/.test(value) && !/^#[0-9a-fA-F]+$/.test(value)) continue;
        offenders.push(`${relative(SRC, file)}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not reference retired brand colours (orange, the earlier violet, and electric lime) in source", () => {
    const retired = /(ff8a00|a66cff|e43deb|7b3fe4|a84500|d95f00|e3ff50|11130d|20221b|526500)/i;
    const offenders = files
      .filter((f) => retired.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
