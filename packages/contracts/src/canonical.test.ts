import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeActionDigest,
  validateActionRequest,
  type DigestInput,
} from "./index";

const base = {
  action: "crm.lead.create",
  resource: "mockcrm/leads",
  environmentId: "env-1",
  parameters: { full_name: "Ada Example", email: "ada@example.test", company: "Sample Co" },
};

describe("canonicalJson", () => {
  it("sorts keys and removes whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: "x", c: [2, 1] } })).toBe(
      '{"a":{"c":[2,1],"d":"x"},"b":1}',
    );
  });

  it("is independent of key insertion order", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("keeps array order (order is meaningful)", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("escapes strings so they cannot forge structure", () => {
    expect(canonicalJson({ a: '","b":"x' })).toBe('{"a":"\\",\\"b\\":\\"x"}');
  });

  it("refuses values JSON cannot represent instead of dropping them", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
    expect(() => canonicalJson({ a: 1n })).toThrow();
    expect(() => canonicalJson({ a: () => 1 })).toThrow();
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: Infinity })).toThrow();
    expect(() => canonicalJson({ a: new Date() })).toThrow();
    expect(() => canonicalJson({ a: new Map() })).toThrow();
  });

  it("limits nesting depth", () => {
    let deep: unknown = "x";
    for (let i = 0; i < 40; i++) deep = [deep];
    expect(() => canonicalJson(deep)).toThrow();
  });

  it("treats a __proto__ own key as ordinary data", () => {
    const o = JSON.parse('{"__proto__":{"a":1},"b":2}') as unknown;
    expect(canonicalJson(o)).toBe('{"__proto__":{"a":1},"b":2}');
  });
});

describe("computeActionDigest", () => {
  const digest = (over: Partial<DigestInput> = {}) => computeActionDigest({ ...base, ...over });

  it("is a 64-character lowercase hex SHA-256", () => {
    expect(digest()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across calls and parameter key order", () => {
    const reordered = {
      company: "Sample Co",
      email: "ada@example.test",
      full_name: "Ada Example",
    };
    expect(digest()).toBe(digest());
    expect(digest({ parameters: reordered })).toBe(digest());
  });

  it("changes when any bound element changes", () => {
    const original = digest();
    expect(digest({ action: "crm.lead.delete" })).not.toBe(original);
    expect(digest({ resource: "mockcrm/leads2" })).not.toBe(original);
    expect(digest({ environmentId: "env-2" })).not.toBe(original);
    for (const key of Object.keys(base.parameters)) {
      expect(
        digest({ parameters: { ...base.parameters, [key]: "changed" } }),
        `parameter ${key}`,
      ).not.toBe(original);
    }
  });

  it("changes when a parameter is added or removed", () => {
    const original = digest();
    expect(digest({ parameters: { ...base.parameters, extra: "x" } })).not.toBe(original);
    const fewer = Object.fromEntries(
      Object.entries(base.parameters).filter(([key]) => key !== "company"),
    );
    expect(digest({ parameters: fewer })).not.toBe(original);
  });

  it("does not let a value spill into a neighbouring field", () => {
    const a = digest({ parameters: { full_name: "A", email: "b", company: "c" } });
    const b = digest({ parameters: { full_name: 'A","email":"b', email: "", company: "c" } });
    expect(a).not.toBe(b);
  });

  it("is the same for visually identical input once it has been validated (NFC, case, spacing)", () => {
    const composed = validateActionRequest({
      action: base.action,
      resource: base.resource,
      parameters: {
        full_name: ` Zo${String.fromCodePoint(0xe9)} `,
        email: "ADA@Example.TEST ",
        company: "Sample Co",
      },
    });
    const decomposed = validateActionRequest({
      action: base.action,
      resource: base.resource,
      parameters: {
        full_name: `Zoe${String.fromCodePoint(0x301)}`,
        email: "ada@example.test",
        company: "Sample Co",
      },
    });
    expect(composed.ok && decomposed.ok).toBe(true);
    if (composed.ok && decomposed.ok) {
      expect(composed.request.parameters).toEqual(decomposed.request.parameters);
      const d = (p: Readonly<Record<string, string>>) => digest({ parameters: p });
      expect(d(composed.request.parameters)).toBe(d(decomposed.request.parameters));
    }
  });
});
