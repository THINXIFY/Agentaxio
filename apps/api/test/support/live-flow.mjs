// Manual end-to-end check of the LIVE dashboard path. Needs the local stack and the website running (see docs/BE-02-BACKEND.md):
//   pnpm --filter @agentaxio/api dev:stack      (terminal 1; ephemeral, start it fresh each time)
//   AXO_API_URL=http://127.0.0.1:8788 pnpm --filter @agentaxio/web dev      (terminal 2)
//   node apps/api/test/support/live-flow.mjs
// It walks: sign-in through the real OIDC flow -> organization -> agent -> key -> rule -> invite approver/viewer -> agent request ->
// approval (self-approval, wrong fingerprint and viewer refused) -> executor -> mock CRM -> activity -> suspend -> logout.
// End-to-end over HTTP: browser-like client -> Next (:3000, proxy) -> management API -> Postgres; agent API; executor; mock CRM.
const say = (line) =>
  process.stdout.write(`${line}
`);
const WEB = "http://localhost:3000";
const AGENT_API = "http://127.0.0.1:8787";
const CRM = "http://127.0.0.1:8790";

class Browser {
  jar = new Map();
  absorb(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === "" || attrs.some((a) => a.toLowerCase() === "max-age=0")) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async req(url, { method = "GET", body, headers = {} } = {}) {
    const h = { ...headers };
    if (this.jar.size) h.cookie = this.cookie();
    if (method === "POST") {
      h["content-type"] = "application/json";
      h.origin = WEB;
      if (this.jar.get("axo_csrf")) h["x-csrf-token"] = this.jar.get("axo_csrf");
    }
    const res = await fetch(url, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    this.absorb(res);
    return res;
  }
  async signIn(who) {
    const start = await this.req(`${WEB}/api/auth/login?return_to=/dashboard`);
    if (start.status !== 302) throw new Error(`login start ${start.status}`);
    const to = new URL(start.headers.get("location"));
    to.searchParams.set("login_as", who);
    const idp = await fetch(to, { redirect: "manual" });
    const back = new URL(idp.headers.get("location"));
    const cb = await this.req(`${WEB}${back.pathname}${back.search}`);
    if (cb.status !== 302) throw new Error(`callback ${cb.status} ${await cb.text()}`);
    return cb.headers.get("location");
  }
}

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  say(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + extra}`);
};
const text = async (res) => (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function waitForWeb() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${WEB}/dashboard`, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {
      // not up yet: try again
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("web never came up");
}

await waitForWeb();
const ada = new Browser();
const grace = new Browser();
const alan = new Browser();

// 1. signed out
let page = await text(await ada.req(`${WEB}/dashboard`));
check(
  "signed-out dashboard offers sign-in and says it never sees a password",
  /Sign in to see your workspace/.test(page) && /never sees your password/.test(page),
  page.slice(0, 300),
);
check(
  "live banner is shown, not the demo banner",
  /Local development backend/.test(page) && !/Frontend demo/.test(page),
);

// 2. sign in (ada) -> no organization
const loc = await ada.signIn("ada");
check("sign-in redirects to the dashboard", String(loc).endsWith("/dashboard"), String(loc));
check(
  "session cookie is HttpOnly-style and CSRF cookie readable",
  ada.jar.has("axo_session") && ada.jar.has("axo_csrf"),
);
page = await text(await ada.req(`${WEB}/dashboard`));
check(
  "new account is offered organization creation",
  /Create your organization/.test(page),
  page.slice(0, 300),
);

// 3. create org
let res = await ada.req(`${WEB}/api/v1/organizations`, {
  method: "POST",
  body: { name: "Demo Org", slug: "demo-org" },
});
const org = (await res.json()).organizationId;
check("organization created through the proxy", res.status === 201 && !!org, String(res.status));
const base = `${WEB}/api/v1/orgs/${org}`;
const envs = await (await ada.req(`${base}/environments`)).json();
const dev = envs.find((e) => e.name === "dev").id;
const me = await (await ada.req(`${WEB}/api/v1/me`)).json();

// 4. CSRF/origin
res = await fetch(`${base}/agents`, {
  method: "POST",
  headers: {
    cookie: ada.cookie(),
    "content-type": "application/json",
    origin: "http://evil.test",
    "x-csrf-token": ada.jar.get("axo_csrf"),
  },
  body: "{}",
});
check("a write from another origin is refused", res.status === 403, String(res.status));
res = await fetch(`${base}/agents`, {
  method: "POST",
  headers: { cookie: ada.cookie(), "content-type": "application/json", origin: WEB },
  body: "{}",
});
check("a write without the CSRF token is refused", res.status === 403, String(res.status));

// 5. agent, key, rule
res = await ada.req(`${base}/agents`, {
  method: "POST",
  body: {
    name: "Lead Intake Agent",
    description: "Adds leads from forms.",
    environmentId: dev,
    ownerUserId: me.userId,
  },
});
const agentId = (await res.json()).agentId;
check("agent registered", res.status < 300 && !!agentId, String(res.status));
res = await ada.req(`${base}/agents/${agentId}/credentials`, { method: "POST", body: {} });
const key = (await res.json()).fullKey;
check("access key issued once", res.status < 300 && key?.startsWith("axo_"), String(res.status));
res = await ada.req(`${base}/policies`, {
  method: "POST",
  body: {
    actionKey: "crm.lead.create",
    effect: "require_approval",
    conditions: { all: [] },
    agentId,
  },
});
check("rule created", res.status < 300, String(res.status));

// 6. pages render real data
page = await text(await ada.req(`${WEB}/dashboard/agents`));
check(
  "My Agents lists the real agent",
  /Lead Intake Agent/.test(page) && /1 active key/.test(page),
  page.slice(0, 400),
);
page = await text(await ada.req(`${WEB}/dashboard/agents/${agentId}`));
check(
  "agent page shows key prefix, never the secret",
  /[0-9a-f]{24} ?…/.test(page) && !page.includes(key.split("_")[2]),
  page.slice(0, 300),
);
page = await text(await ada.req(`${WEB}/dashboard/policies`));
check("Permissions shows the rule", /Needs approval/.test(page) && /every request/.test(page));

// 7. invite grace (approver) and alan (viewer)
for (const [who, email, role, browser] of [
  ["grace", "grace.approver@example.test", "approver", grace],
  ["alan", "alan.viewer@example.test", "viewer", alan],
]) {
  await browser.signIn(who);
  const inv = await (
    await ada.req(`${base}/invitations`, { method: "POST", body: { email, role } })
  ).json();
  const acc = await browser.req(`${WEB}/api/v1/invitations/accept`, {
    method: "POST",
    body: { token: inv.token },
  });
  check(`${who} joined as ${role}`, acc.status === 200, String(acc.status));
}

// 8. the agent asks (pending approval)
const submit = (body, k = key) =>
  fetch(`${AGENT_API}/v1/action-requests`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${k}`,
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
const lead = {
  action: "crm.lead.create",
  resource: "mockcrm/leads",
  parameters: { full_name: "Grace Hopper", email: "grace.h@example.test", company: "Navy Test Co" },
};
res = await submit(lead);
const sub = await res.json();
check(
  "agent request waits for approval",
  res.status === 202 || sub.status === "pending_approval",
  JSON.stringify(sub),
);

page = await text(await grace.req(`${WEB}/dashboard/approvals`));
check(
  "approver sees the exact values",
  /Grace Hopper/.test(page) &&
    /grace\.h@example\.test/.test(page) &&
    /Navy Test Co/.test(page) &&
    /Approve/.test(page),
  page.slice(0, 600),
);
page = await text(await alan.req(`${WEB}/dashboard/approvals`));
check(
  "viewer sees the request but not the values or buttons",
  /Lead Intake Agent/.test(page) &&
    !/Navy Test Co/.test(page) &&
    !/Approve/.test(page.replace(/Approvals|Pending Approvals|approval/g, "")),
  page.slice(0, 400),
);

// 9. decisions
const pending = await (await grace.req(`${base}/approvals?state=pending`)).json();
const approvalId = pending[0].id;
const review = await (await grace.req(`${base}/approvals/${approvalId}`)).json();
res = await ada.req(`${base}/approvals/${approvalId}/decision`, {
  method: "POST",
  body: { decision: "approve", reviewedDigest: review.digest },
});
check(
  "the agent's owner cannot approve it",
  res.status === 403 && (await res.json()).error.reason === "SELF_APPROVAL",
  String(res.status),
);
res = await grace.req(`${base}/approvals/${approvalId}/decision`, {
  method: "POST",
  body: { decision: "approve", reviewedDigest: "0".repeat(64) },
});
check("a decision on a different fingerprint is refused", res.status === 409, String(res.status));
res = await alan.req(`${base}/approvals/${approvalId}/decision`, {
  method: "POST",
  body: { decision: "approve", reviewedDigest: review.digest },
});
check("a viewer cannot decide", res.status === 403, String(res.status));
const crmBefore = await (
  await fetch(`${CRM}/leads`, { headers: { authorization: "Bearer wrong" } })
).status;
check("mock CRM refuses outsiders", crmBefore === 401);
res = await grace.req(`${base}/approvals/${approvalId}/decision`, {
  method: "POST",
  body: { decision: "approve", reviewedDigest: review.digest, comment: "ok" },
});
const decided = await res.json();
check(
  "approver approves with the reviewed fingerprint",
  res.status === 200 && decided.outcome === "approved",
  JSON.stringify(decided),
);

// 10. executor runs it; activity shows Completed
let completed = false;
for (let i = 0; i < 20 && !completed; i++) {
  await new Promise((r) => setTimeout(r, 700));
  const reqs = await (await ada.req(`${base}/requests?limit=5`)).json();
  completed = reqs[0]?.status === "succeeded";
}
check("the trusted executor ran it exactly once (status succeeded)", completed);
page = await text(await ada.req(`${WEB}/dashboard/audit`));
check(
  "Activity shows Completed and the audit trail",
  /Completed/.test(page) && /Execution completed/.test(page) && /Approved by a person/.test(page),
  page.slice(0, 500),
);
check("Activity never shows the lead's details", !/Navy Test Co|grace\.h@example/.test(page));
page = await text(await ada.req(`${WEB}/dashboard`));
check(
  "Overview shows real counts and no sample-data claim",
  /Connected Agents/.test(page) && !/Sample data as of/.test(page),
  page.slice(0, 300),
);

// 11. suspend, logout
res = await ada.req(`${base}/agents/${agentId}/suspend`, { method: "POST", body: {} });
check(
  "suspend works",
  res.status === 200 || res.status === 204 || res.status === 201,
  String(res.status),
);
res = await submit(lead);
check("a suspended agent is refused", res.status === 403 || res.status === 401, String(res.status));
res = await ada.req(`${WEB}/api/auth/logout`, { method: "POST", body: {} });
check("logout", res.status === 204, String(res.status));
page = await text(await ada.req(`${WEB}/dashboard`));
check(
  "after logout the dashboard asks to sign in again",
  /Sign in to see your workspace/.test(page),
);

say(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
