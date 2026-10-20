import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Parses the real tokens.css and enforces WCAG 2.2 contrast for semantic pairs in BOTH palettes.
 * Text pairs need 4.5:1 (AA); non-text UI boundaries (input border, focus ring) need 3:1 (1.4.11).
 */

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

function readBlock(selectorPattern: RegExp): Record<string, string> {
  const match = css.match(selectorPattern);
  if (!match?.[1]) throw new Error(`tokens.css block not found: ${selectorPattern}`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (name && value) tokens[name] = value;
  }
  return tokens;
}

const light = readBlock(/:root,\s*\.surface-light\s*\{([^}]*)\}/);
const dark = readBlock(/\.dark,\s*\.surface-dark\s*\{([^}]*)\}/);
// Dashboard scope: only some roles are redefined, so each dashboard palette is the base palette plus its overrides.
const dashLight = { ...light, ...readBlock(/\n\.dashboard-scope\s*\{([^}]*)\}/) };
const dashDark = {
  ...dark,
  ...readBlock(/\.dark \.dashboard-scope,\s*\.dashboard-scope \.surface-dark\s*\{([^}]*)\}/),
};

const palettes = { light, dark, "dashboard light": dashLight, "dashboard dark": dashDark } as const;

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = [
  "background",
  "surface",
  "surface-raised",
  "surface-sunken",
  "surface-hover",
  "shell",
  "workspace",
];
const STATUSES = ["success", "warning", "danger", "info"];

/** [foreground token, background token, minimum ratio] */
const pairs: Array<[string, string, number]> = [
  ...SURFACES.map((s): [string, string, number] => ["foreground", s, 4.5]),
  ...SURFACES.map((s): [string, string, number] => ["muted-foreground", s, 4.5]),
  ...SURFACES.map((s): [string, string, number] => ["primary-text", s, 4.5]), // links, icons, lime-as-text
  ...SURFACES.map((s): [string, string, number] => ["accent-text", s, 4.5]),
  ...SURFACES.map((s): [string, string, number] => ["mark", s, 3]), // logo detail
  ["primary-foreground", "primary", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["primary-foreground", "accent", 4.5],
  ["subtle-foreground", "subtle", 4.5],
  ...STATUSES.flatMap((s): Array<[string, string, number]> => [
    [`${s}-text`, `${s}-muted`, 4.5],
    [`${s}-text`, "background", 4.5],
    [`${s}-text`, "surface", 4.5],
    [s, "background", 3], // icons / status dots
    [s, "surface", 3],
  ]),
  // Non-text contrast
  ...SURFACES.map((s): [string, string, number] => ["input-border", s, 3]),
  ...SURFACES.map((s): [string, string, number] => ["ring", s, 3]),
];

describe.each(Object.entries(palettes))("%s palette contrast (WCAG 2.2 AA)", (name, tokens) => {
  // In the light dashboard the shell is the always-dark sidebar; its text comes from the dark palette (checked below).
  const applicable = name === "dashboard light" ? pairs.filter(([, bg]) => bg !== "shell") : pairs;
  it.each(applicable)("%s on %s ≥ %s:1", (fg, bg, min) => {
    const fgHex = tokens[fg];
    const bgHex = tokens[bg];
    expect(fgHex, `missing token --${fg}`).toBeDefined();
    expect(bgHex, `missing token --${bg}`).toBeDefined();
    const ratio = contrast(fgHex!, bgHex!);
    expect(
      ratio,
      `${fg} ${fgHex} on ${bg} ${bgHex} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(min);
  });
});

describe("dashboard light: the dark sidebar", () => {
  it("uses dark-palette text on its shell colour", () => {
    expect(dashLight["shell"]).toBe(dashDark["shell"]);
    expect(contrast(dashDark["foreground"]!, dashLight["shell"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dashDark["muted-foreground"]!, dashLight["shell"]!)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(dashDark["primary-text"]!, dashLight["shell"]!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("palette parity", () => {
  it("defines the same semantic roles in every palette", () => {
    const expected = Object.keys(light).sort();
    for (const [name, tokens] of Object.entries(palettes))
      expect(Object.keys(tokens).sort(), name).toEqual(expected);
  });
});
