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
  const suffix = crypto.randomUUID();
  const loginPassword = crypto.randomUUID();
  const registration = await post("auth", {
    action: "register",
    email: `runtime-${suffix}@example.com`,
    business: "Isolated runtime QA",
    owner: "QA",
    password: loginPassword,
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
  // A second authenticated session represents another device downloading cloud data.
  const secondLogin = await post("auth", {
    action: "login", email: `runtime-${suffix}@example.com`, password: loginPassword,
  });
  assert.equal(secondLogin.status, 200);
  const secondCookie = secondLogin.headers.get("set-cookie").split(";")[0];
  let reply = await post("sync", { businessId: account.id, operations: [] }, secondCookie);
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).state.products[0].id, op.payload.id);
  const sale = {
    id: crypto.randomUUID(), at: Date.now(), type: "sale",
    payload: { items: [{ productId: op.payload.id, quantity: 2, price: 5000 }], method: "Cash", total: 10000 },
  };
  for (let retry = 0; retry < 2; retry++) {
    reply = await post("sync", { businessId: account.id, operations: [sale] }, cookie);
    assert.equal(reply.status, 200);
    const result = await reply.json();
    assert.equal(result.state.products[0].quantity, 3);
    assert.equal(result.state.sales.length, 1, "Retry must not duplicate a sale");
  }
  reply = await post("sync", { businessId: account.id, operations: [] }, secondCookie);
  assert.equal(reply.status, 200);
  const fromCloud = await reply.json();
  assert.equal(fromCloud.state.products[0].quantity, 3);
  assert.equal(fromCloud.state.sales[0].total, 10000);
  // Both sessions sell the same remaining stock before learning about the other sale.
  const competing = [cookie, secondCookie].map((session, index) => ({
    session,
    operation: {
      id: crypto.randomUUID(), at: Date.now(), type: "sale",
      payload: {
        items: [{ productId: op.payload.id, name: "Runtime sugar", quantity: 3, price: 5000 }],
        method: index ? "MTN Mobile Money" : "Cash", total: 15000,
      },
    },
  }));
  const races = await Promise.all(competing.map(async ({ session, operation }) => {
    const response = await post("sync", { businessId: account.id, operations: [operation] }, session);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }));
  assert.equal(races.reduce((sum, result) => sum + result.accepted.length, 0), 1);
  assert.equal(races.reduce((sum, result) => sum + result.rejected.length, 0), 1);
  const rejectedId = races.flatMap((result) => result.rejected)[0].id;
  const originalConflict = competing.find(({ operation }) => operation.id === rejectedId).operation;
  reply = await post("sync", { businessId: account.id, operations: [] }, cookie);
  let conflictState = (await reply.json()).state;
  assert.equal(conflictState.products[0].quantity, 0);
  assert.equal(conflictState.sales.length, 2);
  assert.equal(conflictState.sales.reduce((sum, item) => sum + item.total, 0), 25000);
  assert.deepEqual(conflictState.reviews.find((review) => review.id === rejectedId).operation, originalConflict);
  const restock = { id: crypto.randomUUID(), at: Date.now(), type: "adjust", payload: { id: op.payload.id, delta: 10, reason: "QA restock" } };
  reply = await post("sync", { businessId: account.id, operations: [restock, originalConflict] }, secondCookie);
  const replayed = await reply.json();
  assert.equal(reply.status, 200);
  assert.equal(replayed.rejected[0].id, rejectedId);
  assert.equal(replayed.state.products[0].quantity, 10, "Restocking must not silently accept a rejected sale");
  assert.equal(replayed.state.sales.length, 2);
  const decision = {
    id: crypto.randomUUID(), at: Date.now(), type: "resolve",
    payload: { id: rejectedId, reason: "Checked stock and payment records; retained for reconciliation" },
  };
  for (let retry = 0; retry < 2; retry++) {
    reply = await post("sync", { businessId: account.id, operations: [decision] }, cookie);
    assert.equal(reply.status, 200);
    conflictState = (await reply.json()).state;
    const reviewed = conflictState.reviews.find((review) => review.id === rejectedId);
    assert.equal(reviewed.resolved, true);
    assert.equal(reviewed.resolution, decision.payload.reason);
    assert.equal(reviewed.history.length, 1);
    assert.deepEqual(reviewed.operation, originalConflict);
    assert.equal(conflictState.products[0].quantity, 10);
    assert.equal(conflictState.sales.length, 2);
  }
  reply = await post("sync", { businessId: account.id, operations: [] }, secondCookie);
  assert.equal((await reply.json()).state.reviews.find((review) => review.id === rejectedId).resolved, true);
  console.log("PASS: concurrent last-stock sales, retained complete conflict evidence, no replay after restock and persistent idempotent owner resolution.");
  // Import missing backup records, then retry without duplicating their sales.
  const backupState = structuredClone(conflictState);
  const restoredProductId = crypto.randomUUID();
  const restoredSaleId = crypto.randomUUID();
  const restoredProductOperation = crypto.randomUUID();
  backupState.products.push({ id: restoredProductId, name: "Restored soap", price: 2500, quantity: 1, threshold: 1, updatedAt: Date.now(), revision: restoredProductOperation });
  backupState.sales.push({ id: restoredSaleId, at: Date.now(), method: "Cash", total: 5000, items: [{ productId: restoredProductId, name: "Restored soap", price: 2500, quantity: 2 }] });
  backupState.applied.push(restoredProductOperation, restoredSaleId);
  const restoreOperation = { id: crypto.randomUUID(), type: "restore", at: Date.now(), payload: { businessId: account.id, state: backupState } };
  for (let retry = 0; retry < 2; retry++) {
    reply = await post("sync", { businessId: account.id, operations: [restoreOperation] }, cookie);
    assert.equal(reply.status, 200);
    const restored = await reply.json();
    assert(restored.accepted.includes(restoreOperation.id));
    assert.equal(restored.state.products.find((product) => product.id === restoredProductId).quantity, 1);
    assert.equal(restored.state.sales.filter((item) => item.id === restoredSaleId).length, 1);
  }
  reply = await post("sync", { businessId: account.id, operations: [] }, secondCookie);
  const persistedRestore = (await reply.json()).state;
  assert.equal(persistedRestore.sales.find((item) => item.id === restoredSaleId).total, 5000);
  const conflictingBackup = structuredClone(backupState);
  conflictingBackup.products.find((product) => product.id === restoredProductId).quantity = 99;
  const overwriteAttempt = { id: crypto.randomUUID(), type: "restore", at: Date.now(), payload: { businessId: account.id, state: conflictingBackup } };
  reply = await post("sync", { businessId: account.id, operations: [overwriteAttempt] }, cookie);
  const blockedRestore = await reply.json();
  assert.equal(blockedRestore.rejected[0].id, overwriteAttempt.id);
  assert.equal(blockedRestore.state.products.find((product) => product.id === restoredProductId).quantity, 1);
  assert.equal(blockedRestore.state.sales.filter((item) => item.id === restoredSaleId).length, 1);
  console.log("PASS: real Worker/D1 backup restoration, persisted sales, duplicate retry and conflicting-overwrite protection.");
  const otherRegistration = await post("auth", {
    action: "register", email: `other-${suffix}@example.com`, business: "Other isolated QA", owner: "Other QA", password: crypto.randomUUID(),
  });
  assert.equal(otherRegistration.status, 200);
  const otherCookie = otherRegistration.headers.get("set-cookie").split(";")[0];
  reply = await post("sync", { operations: [] }, otherCookie);
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).state.products.length, 0);
  assert.equal((await post("sync", { businessId: account.id, operations: [] }, otherCookie)).status, 409);
  // A forged operation must remain scoped to its authenticated business.
  const forgedAdjustment = { id: crypto.randomUUID(), at: Date.now(), type: "adjust", payload: { id: op.payload.id, delta: 50, reason: "Attempted cross-business adjustment" } };
  const forgedRestore = { id: crypto.randomUUID(), at: Date.now(), type: "restore", payload: { businessId: account.id, state: backupState } };
  reply = await post("sync", { operations: [forgedAdjustment, forgedRestore] }, otherCookie);
  assert.equal(reply.status, 200);
  const rejectedAttacks = await reply.json();
  assert.equal(rejectedAttacks.accepted.length, 0);
  assert.equal(rejectedAttacks.rejected.length, 2);
  assert.equal(rejectedAttacks.state.products.length, 0);
  assert.equal(rejectedAttacks.state.sales.length, 0);
  reply = await post("sync", { businessId: account.id, operations: [] }, cookie);
  assert.deepEqual((await reply.json()).state, blockedRestore.state, "Another business must not modify the original workspace");
  const ownAudit = await fetch(origin + "/api/audit", { headers: { Cookie: cookie } });
  // Migration IDs are intentionally business-scoped, not globally unique.
  const ownEventIds = new Set((await ownAudit.json()).events.filter((event) => event.action !== "legacy-migration").map((event) => event.id));
  const otherAudit = await fetch(origin + "/api/audit?businessId=" + account.id, { headers: { Cookie: otherCookie } });
  assert.equal(otherAudit.status, 200);
  const otherEvents = (await otherAudit.json()).events;
  assert(otherEvents.length > 0);
  assert(otherEvents.every((event) => event.actor === "Other QA" && !ownEventIds.has(event.id)), "Query parameters must not expose another business's audit events");
  console.log("PASS: forged stock/restore operations cannot modify another business; audit events remain session-scoped.");
  assert.equal((await post("sync", { operations: [] })).status, 401);
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
    "PASS: real Worker/D1 registration, two-session cloud downloads, sale persistence, idempotent retry, business isolation, audit, recovery-unconfigured response and logout. Isolated local database only; browser offline lifecycle remains unverified.",
  );
} finally {
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      timeout: 10000,
    });
  else server.kill("SIGTERM");
  // Do not let inherited output pipes keep the test runner alive after shutdown.
  server.stdout?.destroy();
  server.stderr?.destroy();
  server.unref();
}
