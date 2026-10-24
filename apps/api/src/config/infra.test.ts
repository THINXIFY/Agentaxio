import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), "utf8");

describe("local infrastructure hygiene", () => {
  const compose = root("docker-compose.yml");

  it("binds the development database to loopback only", () => {
    const ports = compose.match(/^\s*-\s*"([^"]*:\d+:\d+)"/gm) ?? [];
    expect(ports.length).toBeGreaterThan(0);
    for (const p of ports) expect(p).toContain("127.0.0.1:");
  });

  it("takes the database password from the environment, never a literal", () => {
    expect(compose).toMatch(/POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD:\?/);
  });

  it("ships only placeholder values in tracked .env.example files", () => {
    expect(root(".env.example")).toContain("change-me");
    const api = root("apps/api/.env.example");
    expect(api).toContain("change-me");
    expect(api).toMatch(/^AXO_CREDENTIAL_PEPPER=$/m);
  });
});
