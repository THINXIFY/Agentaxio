import { describe, expect, it } from "vitest";
import {
  ACTION_REQUEST_STATUSES,
  canTransition,
  canonicalJson,
  computeActionDigest,
  isTerminal,
  validateActionRequest,
  type ActionRequestStatus,
} from "./index";

/** Regression and boundary tests from the B1 security review (docs/BE-01-B1-SECURITY-REVIEW.md). */

const cp = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

const request = (over: Record<string, unknown> = {}) =>
  validateActionRequest({
    action: "crm.lead.create",
    resource: "mockcrm/leads",
    parameters: {
      full_name: "Ada Example",
      email: "ada@example.test",
      company: "Sample Co",
      ...over,
    },
  });

const company = (value: string) => {
  const r = request({ company: value });
  return r.ok ? r.request.parameters.company : null;
};

describe("review item 5: the state machine is exactly the intended graph", () => {
  // Written out independently of the implementation.
  const LEGAL = new Set([
    "pending_approval>approved",
    "pending_approval>denied",
    "pending_approval>expired",
    "approved>queued_execution",
    "approved>denied",
    "approved>expired",
    "queued_execution>running",
    "queued_execution>denied",
    "queued_execution>expired",
    "running>succeeded",
    "running>failed",
    "running>unknown",
  ]);

  it("allows exactly these 12 transitions out of 81 possible pairs", () => {
    let legal = 0;
    for (const from of ACTION_REQUEST_STATUSES) {
      for (const to of ACTION_REQUEST_STATUSES) {
        const expected = LEGAL.has(`${from}>${to}`);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected);
        if (expected) legal += 1;
      }
    }
    expect(legal).toBe(12);
  });

  it("treats unrecognised or prototype-named statuses as having no transitions, and never throws", () => {
    const hostile = [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
      "valueOf",
      "",
      "SUCCEEDED",
      "approved ",
      "running\u0000",
    ];
    for (const status of hostile) {
      for (const target of [...ACTION_REQUEST_STATUSES, ...hostile]) {
        expect(canTransition(status as ActionRequestStatus, target as ActionRequestStatus)).toBe(
          false,
        );
      }
      expect(isTerminal(status as ActionRequestStatus), status).toBe(true);
    }
    // And a real status is never allowed to move to a prototype-named one.
    for (const from of ACTION_REQUEST_STATUSES) {
      expect(canTransition(from, "constructor" as ActionRequestStatus)).toBe(false);
    }
  });
});

describe("review item 4 and 6: canonical JSON", () => {
  it("rejects sparse arrays and arrays with extra properties instead of emitting invalid JSON", () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(() => canonicalJson([, 1])).toThrow();
    expect(() => canonicalJson(new Array<number>(3))).toThrow();
    const decorated = [1, 2] as number[] & { extra?: string };
    decorated.extra = "x";
    expect(() => canonicalJson(decorated)).toThrow();
    expect(canonicalJson([])).toBe("[]");
  });

  it("orders keys by UTF-16 code unit, as RFC 8785 requires (not by code point)", () => {
    const emoji = cp(0x1f600); // surrogate pair D83D DE00
    const high = cp(0xffff);
    expect(canonicalJson({ [high]: 1, [emoji]: 2 })).toBe(`{"${emoji}":2,"${high}":1}`);
  });

  it("writes lone surrogates as escapes, deterministically and without throwing", () => {
    const lone = String.fromCharCode(0xd800);
    expect(canonicalJson({ [lone]: lone })).toBe('{"\\ud800":"\\ud800"}');
  });

  it("serializes numbers the way ECMAScript does, with -0 equal to 0", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(1e21)).toBe("1e+21");
    expect(canonicalJson(0.1 + 0.2)).toBe("0.30000000000000004");
    expect(canonicalJson(Number.MAX_SAFE_INTEGER)).toBe("9007199254740991");
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(-Infinity)).toThrow();
  });

  it("rejects non-plain objects, accessors that throw, and excess depth", () => {
    class Box {
      value = "x";
    }
    expect(() => canonicalJson(new Box())).toThrow();
    expect(() => canonicalJson(new String("x"))).toThrow();
    expect(() => canonicalJson(new Set([1]))).toThrow();
    expect(() =>
      canonicalJson({
        get a(): string {
          throw new Error("boom");
        },
      }),
    ).toThrow();
    let deep: unknown = "x";
    for (let i = 0; i < 17; i++) deep = { a: deep };
    expect(() => canonicalJson(deep)).toThrow();
    let ok: unknown = "x";
    for (let i = 0; i < 15; i++) ok = { a: ok };
    expect(() => canonicalJson(ok)).not.toThrow();
  });

  it("ignores symbol keys and non-enumerable properties consistently", () => {
    const o = { a: 1 };
    Object.defineProperty(o, "hidden", { value: "x", enumerable: false });
    Object.defineProperty(o, Symbol("s"), { value: "y", enumerable: true });
    expect(canonicalJson(o)).toBe('{"a":1}');
  });

  it("is deterministic for 500 random nested values regardless of key insertion order", () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const keys = [
      "a",
      "b",
      "c",
      "Z",
      "é",
      cp(0x1f600),
      cp(0xffff),
      "__proto__",
      "constructor",
      "10",
      "2",
    ];
    const build = (depth: number): unknown => {
      const r = random();
      if (depth > 3 || r < 0.25) return ["x", 1, true, null, "é", -0][Math.floor(random() * 6)];
      if (r < 0.5) return Array.from({ length: Math.floor(random() * 4) }, () => build(depth + 1));
      const entries = keys.filter(() => random() < 0.4).map((k) => [k, build(depth + 1)] as const);
      return Object.fromEntries(entries);
    };
    const shuffleKeys = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(shuffleKeys);
      if (typeof v === "object" && v !== null) {
        const entries = Object.entries(v).map(([k, x]) => [k, shuffleKeys(x)] as const);
        for (let i = entries.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          const a = entries[i];
          const b = entries[j];
          if (a === undefined || b === undefined) throw new Error("unreachable");
          entries[i] = b;
          entries[j] = a;
        }
        return Object.fromEntries(entries);
      }
      return v;
    };
    for (let i = 0; i < 500; i++) {
      const value = build(0);
      const a = canonicalJson(value);
      expect(canonicalJson(shuffleKeys(value))).toBe(a);
      expect(JSON.parse(a)).toEqual(JSON.parse(JSON.stringify(value)));
    }
  });
});

describe("review item 6: duplicate keys and parser differentials", () => {
  it("JSON.parse keeps the last duplicate, so only one value is ever digested, reviewed and executed", () => {
    const body = `{"action":"crm.lead.create","resource":"mockcrm/leads","parameters":{"full_name":"Ada Example","email":"first@example.test","email":"second@example.test","company":"Sample Co"}}`;
    const whole = JSON.parse(body) as { parameters: Record<string, unknown> };
    const parsed = request(whole.parameters);
    expect(parsed.ok && parsed.request.parameters.email).toBe("second@example.test");
  });

  it("reaches the same digest as the single-key body, so a duplicate cannot smuggle a second value", () => {
    const withDuplicate = JSON.parse(
      '{"full_name":"A","email":"first@example.test","email":"second@example.test","company":"C"}',
    ) as Record<string, unknown>;
    const single = { full_name: "A", email: "second@example.test", company: "C" };
    const digest = (parameters: Record<string, unknown>) => {
      const r = request(parameters);
      if (!r.ok) throw new Error("expected valid");
      return computeActionDigest({
        action: r.request.action,
        resource: r.request.resource,
        environmentId: "env",
        parameters: r.request.parameters,
      });
    };
    expect(digest(withDuplicate)).toBe(digest(single));
  });
});

describe("review item 6: unusual Unicode in free text", () => {
  it("rejects lone surrogates (they cannot be stored as UTF-8 and would desynchronize the digest)", () => {
    expect(request({ company: `Co${String.fromCharCode(0xd800)}` }).ok).toBe(false);
    expect(request({ company: `${String.fromCharCode(0xdc00)}Co` }).ok).toBe(false);
    expect(
      request({ company: `${String.fromCharCode(0xdc00)}${String.fromCharCode(0xd800)}` }).ok,
    ).toBe(false);
  });

  it("accepts correctly paired astral characters", () => {
    expect(company(`Smile ${cp(0x1f600)} Co`)).toBe(`Smile ${cp(0x1f600)} Co`);
    expect(company(`${cp(0x20bb7)} Ltd`)).toBe(`${cp(0x20bb7)} Ltd`);
  });

  it("rejects invisible and non-printing characters used for smuggling or spoofing", () => {
    const rejected = [
      cp(0x00ad), // soft hyphen
      cp(0x061c), // Arabic letter mark
      cp(0x180e), // Mongolian vowel separator
      cp(0x200b), // zero-width space
      cp(0x200c), // ZWNJ
      cp(0x200d), // ZWJ (joined emoji sequences are refused in V1)
      cp(0x200e), // left-to-right mark
      cp(0x2028), // line separator
      cp(0x2029), // paragraph separator
      cp(0x202a), // bidi embedding
      cp(0x202e), // right-to-left override
      cp(0x2060), // word joiner
      cp(0x2066), // bidi isolate
      cp(0x2069),
      cp(0xfeff), // BOM / zero-width no-break space
      cp(0xfff9), // interlinear annotation anchor
      cp(0xfffe),
      cp(0xffff),
      cp(0xe0041), // tag character "A" (invisible text)
      cp(0xe007f), // cancel tag
      cp(0x0085), // NEL
      cp(0x0000),
    ];
    for (const c of rejected) {
      expect(
        request({ company: `Blocked${c}Corp` }).ok,
        `U+${(c.codePointAt(0) ?? 0).toString(16)}`,
      ).toBe(false);
      expect(request({ full_name: `${c}Ada` }).ok).toBe(false);
    }
  });

  it("collapses every kind of whitespace run to one ASCII space, so exact-match rules cannot be dodged", () => {
    const canonical = "Blocked Corp";
    const spaces = [
      " ",
      "  ",
      cp(0x00a0), // no-break space
      cp(0x2003), // em space
      cp(0x2009), // thin space
      cp(0x202f), // narrow no-break space
      cp(0x205f),
      cp(0x3000), // ideographic space
      ` ${cp(0x00a0)} ${cp(0x3000)}`,
    ];
    for (const s of spaces) {
      expect(company(`Blocked${s}Corp`), JSON.stringify(s)).toBe(canonical);
      expect(company(`${s}Blocked Corp${s}`)).toBe(canonical);
    }
  });

  it("rejects a separator instead of quietly turning it into a space", () => {
    expect(request({ company: `Blocked${cp(0x2028)}Corp` }).ok).toBe(false);
    expect(request({ company: "Blocked\nCorp" }).ok).toBe(false);
    expect(request({ company: "Blocked\tCorp" }).ok).toBe(false);
  });

  it("makes composed and decomposed text identical (NFC), and keeps width and case variants distinct", () => {
    expect(company(`Caf${cp(0xe9)}`)).toBe(company(`Cafe${cp(0x301)}`));
    // No compatibility folding: policy matching is exact and case-sensitive (documented residual risk).
    expect(company(cp(0xff21, 0xff24, 0xff21))).not.toBe("ADA");
    expect(company("BLOCKED CORP")).not.toBe(company("Blocked Corp"));
  });

  it("treats length as characters after normalization, bounded before it", () => {
    expect(request({ company: "x".repeat(120) }).ok).toBe(true);
    expect(request({ company: "x".repeat(121) }).ok).toBe(false);
    expect(
      request({ company: `${"x".repeat(60)}${cp(0x00a0)}${cp(0x00a0)}${"x".repeat(59)}` }).ok,
    ).toBe(true);
    expect(request({ company: "x".repeat(10_000_000) }).ok).toBe(false);
  });
});

describe("review item 6: malformed objects and containers", () => {
  it("never throws on hostile bodies; they are simply invalid", () => {
    const hostile: unknown[] = [
      {
        get action(): string {
          throw new Error("boom");
        },
      },
      new Proxy(
        {},
        {
          get() {
            throw new Error("boom");
          },
          ownKeys() {
            throw new Error("boom");
          },
        },
      ),
      { action: "crm.lead.create", resource: "mockcrm/leads", parameters: new Map() },
      { action: "crm.lead.create", resource: "mockcrm/leads", parameters: [] },
      { action: "crm.lead.create", resource: "mockcrm/leads", parameters: "x" },
      {
        action: "crm.lead.create",
        resource: "mockcrm/leads",
        parameters: Object.create({ full_name: "inherited" }) as unknown,
      },
    ];
    for (const body of hostile) {
      const r = validateActionRequest(body);
      expect(r.ok).toBe(false);
    }
  });

  it("does not accept inherited properties as parameters", () => {
    const inherited = Object.create({
      full_name: "Ada",
      email: "a@example.test",
      company: "C",
    }) as Record<string, unknown>;
    expect(
      validateActionRequest({
        action: "crm.lead.create",
        resource: "mockcrm/leads",
        parameters: inherited,
      }).ok,
    ).toBe(false);
  });

  it("rejects very deep and very wide values quickly", () => {
    let deep: unknown = "x";
    for (let i = 0; i < 20_000; i++) deep = [deep];
    expect(request({ company: deep }).ok).toBe(false);
    expect(request({ company: Array.from({ length: 100_000 }, () => "x") }).ok).toBe(false);
    const wide = Object.fromEntries(
      Array.from({ length: 50_000 }, (_, i) => [`k${String(i)}`, "x"]),
    );
    expect(
      validateActionRequest({
        action: "crm.lead.create",
        resource: "mockcrm/leads",
        parameters: wide,
      }).ok,
    ).toBe(false);
  });

  it("accepts a null-prototype parameters object with the right keys", () => {
    const params = Object.assign(Object.create(null) as Record<string, unknown>, {
      full_name: "Ada",
      email: "a@example.test",
      company: "C",
    });
    expect(
      validateActionRequest({
        action: "crm.lead.create",
        resource: "mockcrm/leads",
        parameters: params,
      }).ok,
    ).toBe(true);
  });

  it("rejects numeric, boolean, null and nested values in every parameter field", () => {
    for (const field of ["full_name", "email", "company"]) {
      for (const bad of [0, -0, 1e21, Number.NaN, true, null, undefined, {}, [], ["x"], 10n]) {
        expect(request({ [field]: bad }).ok, `${field}=${typeof bad}`).toBe(false);
      }
    }
  });
});
