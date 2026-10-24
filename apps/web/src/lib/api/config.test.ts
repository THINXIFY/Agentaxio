import { describe, expect, it } from "vitest";
import { apiBase, isLiveMode } from "./config";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("apiBase", () => {
  it("is off (demo mode) when nothing is configured", () => {
    expect(apiBase(env({}))).toBeNull();
    expect(apiBase(env({ AXO_API_URL: "  " }))).toBeNull();
    expect(isLiveMode(env({}))).toBe(false);
  });

  it("returns only the origin of a valid http(s) URL", () => {
    expect(apiBase(env({ AXO_API_URL: "http://127.0.0.1:8788/some/path?x=1" }))).toBe(
      "http://127.0.0.1:8788",
    );
    expect(isLiveMode(env({ AXO_API_URL: "https://api.example.test" }))).toBe(true);
  });

  it("refuses anything that could leak a credential or leave the machine unencrypted", () => {
    expect(() => apiBase(env({ AXO_API_URL: "not a url" }))).toThrow();
    expect(() => apiBase(env({ AXO_API_URL: "ftp://example.test" }))).toThrow();
    expect(() => apiBase(env({ AXO_API_URL: "https://user:pw@example.test" }))).toThrow();
    expect(() =>
      apiBase(env({ AXO_API_URL: "http://api.example.test", NODE_ENV: "production" })),
    ).toThrow();
    expect(apiBase(env({ AXO_API_URL: "http://localhost:8788", NODE_ENV: "production" }))).toBe(
      "http://localhost:8788",
    );
  });
});
