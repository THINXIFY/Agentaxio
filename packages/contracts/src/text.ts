import { z } from "zod";

/**
 * Parameter text is untrusted and is later shown to a human approver. Beyond length limits, reject characters that
 * make text look different from what it is: control characters (including NUL, which Postgres cannot store),
 * zero-width and line-separator characters, byte-order marks and bidirectional overrides. Everything else,
 * including SQL- or HTML-looking text, is accepted as plain data and must be escaped on output, never interpreted.
 */
/**
 * Inclusive code point ranges that are rejected: C0 and C1 controls, soft hyphen, Arabic letter mark, Mongolian vowel
 * separator, zero-width and direction marks (this includes ZWJ and ZWNJ, so joined emoji sequences are refused), line
 * and paragraph separators, bidi overrides and isolates, word joiner, BOM, interlinear annotation marks,
 * non-characters at the end of the BMP, the Unicode tag block (invisible text smuggling) and lone surrogates (which
 * cannot be stored as UTF-8 and would make the stored value differ from the digested one).
 */
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2069],
  [0xd800, 0xdfff],
  [0xfeff, 0xfeff],
  [0xfff9, 0xfffb],
  [0xfffe, 0xffff],
  [0xe0000, 0xe007f],
];

export function hasUnsafeCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (UNSAFE_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high)) return true;
  }
  return false;
}

/**
 * Bounded, canonical free text. The raw input is length-bounded and checked for unsafe characters BEFORE any
 * normalization, so a huge string is never processed and a separator cannot be turned into a space and slip through.
 * It is then NFC-normalized and every run of Unicode whitespace (no-break space, em space, ideographic space and so
 * on) is collapsed to one ASCII space, so a doubled space or a no-break space cannot dodge an exact-match rule
 * written for "Blocked Corp". Matching remains exact and case-sensitive (see docs/BE-01-B1-SECURITY-REVIEW.md).
 */
export function boundedText(maxLength: number) {
  return z
    .string()
    .max(maxLength * 4)
    .refine((s) => !hasUnsafeCharacters(s), { message: "unsafe_characters" })
    .transform((s) => s.normalize("NFC").replace(/\s+/gu, " ").trim())
    .pipe(z.string().min(1).max(maxLength));
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
