/**
 * Where the management API lives. Read on the SERVER only (never exposed to the browser): the browser talks to this
 * site's own `/api/*` paths, which next.config.ts forwards to the API. When AXO_API_URL is not set, the dashboard runs
 * in its labelled demo mode on invented data and calls nothing.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function apiBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.AXO_API_URL;
  if (raw === undefined || raw.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AXO_API_URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("AXO_API_URL must be http(s)");
  if (url.username !== "" || url.password !== "")
    throw new Error("AXO_API_URL must not contain credentials");
  if (url.protocol === "http:" && !LOOPBACK.has(url.hostname) && env.NODE_ENV === "production")
    throw new Error("AXO_API_URL must be https unless it points at this machine");
  return url.origin;
}

export const isLiveMode = (env: NodeJS.ProcessEnv = process.env): boolean => apiBase(env) !== null;
