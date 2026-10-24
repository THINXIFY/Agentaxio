import { z } from "zod";

/**
 * Parameter text is untrusted and is later shown to a human approver. Beyond length limits, reject characters that
 * make text look different from what it is: control characters (including NUL, which Postgres cannot store),
 * zero-width and line-separator characters, byte-order marks and bidirectional overrides. Everything else,
 * including SQL- or HTML-looking text, is accepted as plain data and must be escaped on output, never interpreted.
 */
/** Inclusive code point ranges: C0 and C1 controls, zero-width and direction marks, line/paragraph separators, bidi overrides and isolates, word joiner, BOM. */
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];

export function hasUnsafeCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (UNSAFE_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high)) return true;
  }
  return false;
}

/** The raw input is bounded before any normalization, so a huge string is never processed. */
export function boundedText(maxLength: number) {
  return z
    .string()
    .max(maxLength * 4)
    .transform((s) => s.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(maxLength)
        .refine((s) => !hasUnsafeCharacters(s), { message: "unsafe_characters" }),
    );
}

/**
 * ASCII-only, lowercased email. Internationalised addresses are rejected in V1 because a look-alike domain is
 * hard for a reviewer to spot; widening this is a deliberate later decision.
 */
export const emailText = z
  .string()
  .max(1000)
  .transform((s) => s.normalize("NFC").trim().toLowerCase())
  .pipe(
    z
      .string()
      .max(254)
      .refine((s) => /^[\x21-\x7E]+$/.test(s), { message: "non_ascii" })
      .pipe(z.email()),
  );
