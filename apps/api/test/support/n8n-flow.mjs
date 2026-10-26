// Manual end-to-end check with a REAL n8n. Not part of CI (n8n is a large download).
//
//   1. pnpm --filter @agentaxio/api dev:stack            (terminal 1: Postgres, APIs, executor, mock CRM, stand-in sign-in)
//   2. install n8n somewhere OUTSIDE the repository, from a SHORT path (Windows path limits):
//        mkdir C:\Users\you\n8nlab && cd C:\Users\you\n8nlab && npm init -y && npm install n8n
//   3. N8N_DIR=C:/Users/you/n8nlab node apps/api/test/support/n8n-flow.mjs
//
// It signs three invented people in through the real OpenID Connect flow, creates an organization, an agent, its key and
// a rule, imports the SHIPPED example workflow plus a Header Auth credential into n8n's own store, then runs the workflow
// with n8n's CLI while this script plays the human approver. It checks, over the real services, that:
//   - a request that needs approval waits, can't be approved by the agent's owner, and runs only after a different person
//     approves, exactly once, through the trusted executor into the mock CRM;
//   - a blocked request ends the workflow with "denied" and creates nothing;
//   - a revoked key, or an unreachable AgentAxio, makes the workflow stop with an error and creates nothing.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const say = (line) => process.stdout.write(`${line}\n`);
const MGMT = process.env.AXO_MGMT_URL ?? "http://127.0.0.1:8788";
const WEB = "http://localhost:3000";
const N8N_DIR = process.env.N8N_DIR ?? "C:/Users/Soft/n8nlab";
const WORKFLOW = new URL(
  "../../../web/public/n8n/agentaxio-crm-lead-create.workflow.json",
  import.meta.url,
);
const HOME = join(N8N_DIR, "home");
const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  say(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${extra}`}`);
};

class Browser {
  jar = new Map();
  absorb(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      const i = pair.indexOf("=");
      const value = pair.slice(i + 1);
      if (value === "" || attrs.some((a) => a.toLowerCase() === "max-age=0"))
        this.jar.delete(pair.slice(0, i));
      else this.jar.set(pair.slice(0, i), value);
    }
  }
  async req(path, { method = "GET", body } = {}) {
    const headers = {};
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (method === "POST") {
      headers["content-type"] = "application/json";
      headers.origin = WEB;
      if (this.jar.get("axo_csrf")) headers["x-csrf-token"] = this.jar.get("axo_csrf");
    }
    const res = await fetch(`${MGMT}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    this.absorb(res);
    return res;
  }
  async json(path, options) {
    const res = await this.req(path, options);
    const text = await res.text();
    return { status: res.status, body: text === "" ? {} : JSON.parse(text) };
  }
  async signIn(who) {
    const start = await this.req("/auth/login?return_to=/dashboard");
    const to = new URL(start.headers.get("location"));
    to.searchParams.set("login_as", who);
    const back = new URL((await fetch(to, { redirect: "manual" })).headers.get("location"));
    const done = await this.req(`/auth/callback${back.search}`);
    if (done.status !== 302) throw new Error(`sign-in failed (${String(done.status)})`);
  }
}

function runN8n(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(N8N_DIR, "node_modules/n8n/bin/n8n"), ...args], {
      env: {
        ...process.env,
        N8N_USER_FOLDER: HOME,
        N8N_ENCRYPTION_KEY: "local-test-encryption-key-not-secret",
        N8N_DIAGNOSTICS_ENABLED: "false",
        N8N_VERSION_NOTIFICATIONS_ENABLED: "false",
        N8N_PERSONALIZATION_ENABLED: "false",
        N8N_TEMPLATES_ENABLED: "false",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 90_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return undefined;
    await sleep(1500);
  }
}

/** The last JSON document n8n printed (its run data), or null. */
function lastJson(out) {
  const start = out.lastIndexOf("\n[");
  const begin = start >= 0 ? start + 1 : out.indexOf("[");
  if (begin < 0) return null;
  try {
    return JSON.parse(out.slice(begin));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
mkdirSync(HOME, { recursive: true });
const ada = new Browser();
const grace = new Browser();
await ada.signIn("ada");
await grace.signIn("grace");
const me = (await ada.json("/v1/me")).body;
const slug = `n8n-${Math.random().toString(36).slice(2, 8)}`;
const org = (
  await ada.json("/v1/organizations", { method: "POST", body: { name: "n8n demo", slug } })
).body.organizationId;
const base = `/v1/orgs/${org}`;
const envs = (await ada.json(`${base}/environments`)).body;
const agentId = (
  await ada.json(`${base}/agents`, {
    method: "POST",
    body: {
      name: "n8n lead agent",
      environmentId: envs.find((e) => e.name === "dev").id,
      ownerUserId: me.userId,
    },
  })
).body.agentId;
const issued = (
  await ada.json(`${base}/agents/${agentId}/credentials`, { method: "POST", body: {} })
).body;
await ada.json(`${base}/policies`, {
  method: "POST",
  body: {
    actionKey: "crm.lead.create",
    effect: "require_approval",
    conditions: { all: [] },
    agentId,
  },
});
const invite = (
  await ada.json(`${base}/invitations`, {
    method: "POST",
    body: { email: "grace.approver@example.test", role: "approver" },
  })
).body;
check(
  "grace joined as approver",
  (await grace.json("/v1/invitations/accept", { method: "POST", body: { token: invite.token } }))
    .status === 200,
);

// Import the shipped workflow and a credential holding ONLY the agent key into n8n's own store.
const credFile = join(HOME, "credential.json");
const wfFile = join(HOME, "workflow.json");
const workflow = JSON.parse(readFileSync(WORKFLOW, "utf8"));
const asUrl = (id, name, url) => {
  const w = structuredClone(workflow);
  w.id = id;
  w.name = name;
  w.nodes
    .find((n) => n.name === "Proposed lead")
    .parameters.assignments.assignments.find((a) => a.name === "agentaxio_url").value = url;
  return w;
};
writeFileSync(
  credFile,
  JSON.stringify([
    {
      id: "agentaxio-agent-key",
      name: "AgentAxio agent key",
      type: "httpHeaderAuth",
      data: { name: "Authorization", value: `Bearer ${issued.fullKey}` },
    },
  ]),
);
const importedCred = await runN8n(["import:credentials", `--input=${credFile}`]);
rmSync(credFile, { force: true });
check("n8n accepted the credential", importedCred.code === 0, importedCred.out.slice(-300));
writeFileSync(
  wfFile,
  JSON.stringify([
    asUrl("agentaxiolead1", "AgentAxio lead (real)", "http://127.0.0.1:8787"),
    asUrl("agentaxiolead2", "AgentAxio lead (unreachable)", "http://127.0.0.1:9"),
  ]),
);
const importedWf = await runN8n(["import:workflow", `--input=${wfFile}`]);
rmSync(wfFile, { force: true });
check("n8n imported the shipped workflow", importedWf.code === 0, importedWf.out.slice(-300));

const requests = async () => (await ada.json(`${base}/requests?limit=50`)).body;

// --- A. needs approval -> a different person approves -> executor -> mock CRM ------------------------------------
say("\nRun A: needs approval (a person decides; this takes about a minute)");
const runA = runN8n(["execute", "--id=agentaxiolead1", "--rawOutput"]);
const pending = await until(async () => {
  const list = (await grace.json(`${base}/approvals?state=pending`)).body;
  return Array.isArray(list) ? list.find((a) => a.agentId === agentId) : undefined;
});
check("n8n's request is waiting for a person", pending !== undefined);
if (pending) {
  const review = (await grace.json(`${base}/approvals/${pending.id}`)).body;
  check(
    "the approver sees exactly what n8n proposed",
    review.parameters?.full_name === "Ada Example" && review.parameters?.company === "Sample Co",
    JSON.stringify(review.parameters),
  );
  const self = await ada.json(`${base}/approvals/${pending.id}/decision`, {
    method: "POST",
    body: { decision: "approve", reviewedDigest: review.digest },
  });
  check(
    "the agent's owner cannot approve it",
    self.status === 403 && self.body.error?.reason === "SELF_APPROVAL",
    JSON.stringify(self.body),
  );
  const before = (await requests()).filter((r) => r.status === "succeeded").length;
  check("nothing has run while it waits", before === 0);
  const approved = await grace.json(`${base}/approvals/${pending.id}/decision`, {
    method: "POST",
    body: { decision: "approve", reviewedDigest: review.digest },
  });
  check(
    "a different person approves it",
    approved.status === 200 && approved.body.outcome === "approved",
    JSON.stringify(approved.body),
  );
}
const doneA = await runA;
const dataA = lastJson(doneA.out);
check("n8n finished the run successfully", doneA.code === 0, doneA.out.slice(-500));
check(
  "n8n reports 'succeeded'",
  doneA.out.includes('"status": "succeeded"') || doneA.out.includes('"status":"succeeded"'),
  doneA.out.slice(-600),
);
const all = await requests();
check("exactly one request was created by the run", all.length === 1, String(all.length));
const executions = all[0] ? (await ada.json(`${base}/requests/${all[0].id}/executions`)).body : [];
check(
  "the trusted executor created one lead in the mock CRM",
  executions.length === 1 &&
    executions[0].state === "succeeded" &&
    /^lead_/.test(executions[0].externalReference ?? ""),
  JSON.stringify(executions),
);
void dataA;

// --- B. blocked ----------------------------------------------------------------------------------------------------
say("\nRun B: blocked by a rule");
await ada.json(`${base}/policies`, {
  method: "POST",
  body: { actionKey: "crm.lead.create", effect: "deny", conditions: { all: [] }, agentId },
});
const runB = await runN8n(["execute", "--id=agentaxiolead1", "--rawOutput"]);
check(
  "n8n ends with 'denied' and says the lead was not created",
  runB.code === 0 && /denied/.test(runB.out) && /NOT created/.test(runB.out),
  runB.out.slice(-500),
);
const afterB = await requests();
check(
  "the blocked run created no lead",
  afterB.filter((r) => r.status === "succeeded").length === 1 &&
    afterB.some((r) => r.status === "denied"),
  JSON.stringify(afterB.map((r) => r.status)),
);

// --- C. AgentAxio unreachable ---------------------------------------------------------------------------------------
say("\nRun C: AgentAxio unreachable (n8n retries the same request three times)");
const runC = await runN8n(["execute", "--id=agentaxiolead2", "--rawOutput"]);
check("the workflow fails instead of doing anything", runC.code !== 0, runC.out.slice(-400));

// --- D. revoked key -------------------------------------------------------------------------------------------------
say("\nRun D: key revoked");
await ada.json(`${base}/credentials/${issued.credentialId}/revoke`, { method: "POST", body: {} });
const runD = await runN8n(["execute", "--id=agentaxiolead1", "--rawOutput"]);
check(
  "the workflow stops with an error (401)",
  runD.code !== 0 && /HTTP 401|401/.test(runD.out),
  runD.out.slice(-400),
);
check("the revoked key created nothing", (await requests()).length === afterB.length);

say(`\n${String(results.filter(Boolean).length)}/${String(results.length)} checks passed`);
rmSync(join(HOME, "workflow.json"), { force: true });
process.exit(results.every(Boolean) ? 0 : 1);
