// Optional real Worker/D1 smoke test. All state is isolated under .sites-runtime/runtime-smoke.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:net";
const root = process.cwd(),
  runtime = path.join(root, ".sites-runtime/runtime-smoke");
mkdirSync(runtime, { recursive: true });
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
config.main = path.join(root, "dist/server", config.main);
config.assets.directory = path.join(root, "dist/client");
for (const database of config.d1_databases)
  database.migrations_dir = path.join(root, "drizzle");
const configFile = path.join(runtime, "wrangler.json");
writeFileSync(configFile, JSON.stringify(config));
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js"),
  persist = path.join(runtime, "db");
const env = {
  ...process.env,
  CI: "true",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_LOG_PATH: path.join(runtime, "logs"),
};
const migrated = spawnSync(
  process.execPath,
  [
    cli,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    configFile,
    "--persist-to",
    persist,
  ],
  { env, windowsHide: true, encoding: "utf8" },
);
if (migrated.status !== 0)
  throw Error(migrated.stderr || migrated.stdout || "Migration failed");
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const server = spawn(
  process.execPath,
  [
    cli,
    "dev",
    "--local",
    "--config",
    configFile,
    "--persist-to",
    persist,
    "--port",
    String(port),
    "--inspector-port",
    "0",
  ],
  { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
server.stdout.on("data", (x) => (logs += x));
server.stderr.on("data", (x) => (logs += x));
const origin = "http://127.0.0.1:" + port;
async function post(route, data, cookie) {
  return fetch(origin + "/api/" + route, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(data),
  });
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw Error("Worker exited: " + logs.slice(-3000));
    try {
      const response = await fetch(origin);
      if (response.ok) {
        assert.match(await response.text(), /DukaTrack/);
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("Worker did not become ready: " + logs.slice(-3000));
  for (const [route, heading] of [["/forgot-password", "Forgot password?"], ["/reset-password", "Set a new password"]]) {
    const page = await fetch(origin + route);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert(html.includes(heading), route + " must render its heading");
    assert(html.includes("Back to sign in"));
    assert(!html.includes("<select"), "Recovery pages must not expose an action dropdown");
  }
  const suffix = String(Date.now()).slice(-7),
    phone = "070" + suffix;
  const registration = await post("auth", {
    action: "register",
    email: `runtime-${suffix}@example.com`,
    business: "Isolated runtime QA",
    owner: "QA",
    password: crypto.randomUUID(),
  });
  assert.equal(registration.status, 200, await registration.clone().text());
  const cookie = registration.headers.get("set-cookie").split(";")[0],
    account = (await registration.json()).account;
  const op = {
    id: crypto.randomUUID(),
    at: Date.now(),
    type: "product",
    payload: {
      id: crypto.randomUUID(),
      name: "Runtime sugar",
      quantity: 5,
      price: 5000,
      threshold: 2,
    },
  };
  const synced = await post(
    "sync",
    { businessId: account.id, operations: [op] },
    cookie,
  );
  assert.equal(synced.status, 200, await synced.clone().text());
  assert.equal((await synced.json()).state.products[0].quantity, 5);
  const audit = await fetch(origin + "/api/audit", {
    headers: { Cookie: cookie },
  });
  assert.equal(audit.status, 200);
  assert((await audit.json()).events.length > 0);
  assert.equal((await fetch(origin + "/sw.js")).status, 200);
  assert.equal(
    (await post("recovery", { action: "request", email: `runtime-${suffix}@example.com` })).status,
    503,
  );
  assert.equal((await post("auth", { action: "logout" }, cookie)).status, 200);
  assert.equal((await post("sync", { operations: [] }, cookie)).status, 401);
  console.log(
    "PASS: real production Worker HTTP shell, isolated D1 migrations, registration, relational sync, audit, recovery-unconfigured response and logout. This is not browser offline QA.",
  );
} finally {
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill("SIGTERM");
}
