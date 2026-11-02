import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))(
  "esbuild",
);
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const db = new DatabaseSync(":memory:");
// Check the email upgrade against populated accounts with foreign keys enabled.
{
  const upgrade = new DatabaseSync(":memory:");
  upgrade.exec("PRAGMA foreign_keys=ON");
  const migrations = readdirSync("drizzle").filter((x) => x.endsWith(".sql")).sort();
  for (const file of migrations.filter((x) => x < "0003")) {
    upgrade.exec(readFileSync("drizzle/" + file, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  upgrade.exec("INSERT INTO accounts(id,phone,owner,business,password,salt,created_at) VALUES('preserved','256700000099','Owner','Shop','digest','salt',1)");
  upgrade.exec("INSERT INTO sessions(token,account_id,expires) VALUES('session','preserved',9999999999999)");
  upgrade.prepare("INSERT INTO workspaces(account_id,version,data) VALUES(?, ?, ?)").run("preserved", 4, '{"saved":"records"}');
  upgrade.exec("BEGIN");
  upgrade.exec(readFileSync("drizzle/0003_email_accounts.sql", "utf8").replaceAll("--> statement-breakpoint", ""));
  upgrade.exec("COMMIT");
  assert.equal(upgrade.prepare("SELECT password FROM accounts WHERE id='preserved'").get().password, "digest");
  assert.equal(upgrade.prepare("SELECT phone FROM accounts WHERE id='preserved'").get().phone, "256700000099");
  assert.equal(upgrade.prepare("SELECT data FROM workspaces WHERE account_id='preserved'").get().data, '{"saved":"records"}');
  assert.equal(upgrade.prepare("SELECT count(*) AS total FROM sessions").get().total, 1);
  assert.deepEqual(upgrade.prepare("PRAGMA foreign_key_check").all(), []);
  upgrade.close();
}
for (const file of readdirSync("drizzle")
  .filter((x) => x.endsWith(".sql"))
  .sort())
  db.exec(
    readFileSync("drizzle/" + file, "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    ),
  );
const wrap = (sql, args = []) => ({
  bind(...v) {
    return wrap(sql, v);
  },
  async first() {
    return db.prepare(sql).get(...args) || null;
  },
  async all() {
    return { results: db.prepare(sql).all(...args) };
  },
  async run() {
    const r = db.prepare(sql).run(...args);
    return { meta: { changes: Number(r.changes) } };
  },
});
globalThis.__dukaTestEnv = {
  DB: {
    prepare: (sql) => wrap(sql),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const r = [];
        for (const q of statements) r.push(await q.run());
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  },
};
async function route(name) {
  const result = await build({
    entryPoints: [name.endsWith(".ts") ? name : `app/api/${name}/route.ts`],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    plugins: [
      {
        name: "env-test",
        setup(b) {
          b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
            path: "env",
            namespace: "test",
          }));
          b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents: "export const env=globalThis.__dukaTestEnv",
          }));
        },
      },
    ],
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
}
const auth = await route("auth"),
  sync = await route("sync");
const req = (path, p, cookie) =>
  new Request("https://duka.test/api/" + path, {
    method: "POST",
    headers: {
      Origin: "https://duka.test",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(p),
  });
const user = {
  action: "register",
  phone: "0700000001",
  business: "QA Shop",
  owner: "QA Owner",
  password: crypto.randomUUID(),
};
// Email accounts need no phone and email matching ignores case/outer whitespace.
const emailUser = { action: "register", email: " Owner@Example.com ", business: "Email shop", owner: "Owner", password: crypto.randomUUID() };
const emailRegistered = await auth.POST(req("auth", emailUser));
assert.equal(emailRegistered.status, 200, await emailRegistered.clone().text());
const emailAccount = (await emailRegistered.json()).account;
assert.equal(emailAccount.email, "owner@example.com");
assert.equal(emailAccount.phone, null);
assert.equal((await auth.POST(req("auth", { ...emailUser, email: "OWNER@example.com" }))).status, 409);
assert.equal((await auth.POST(req("auth", { ...emailUser, email: "not-an-email" }))).status, 400);
assert.equal((await auth.POST(req("auth", { action: "login", email: "OWNER@example.com", password: emailUser.password }))).status, 200);
assert.equal((await auth.POST(req("auth", { action: "login", email: emailUser.email, password: "incorrect-password" }))).status, 401);
let r = await auth.POST(req("auth", user));
assert.equal(r.status, 200);
const cookie = r.headers.get("set-cookie").split(";")[0];
const account = (await r.json()).account;
const op = (id, type, payload, at = Date.now()) => ({ id, type, payload, at });
let operations = [
  op("p", "product", {
    id: "sugar",
    name: "Sugar",
    price: 5000,
    quantity: 10,
    threshold: 3,
  }),
  op("c", "customer", { id: "grace", name: "Grace", phone: "" }),
  op("s", "sale", {
    items: [{ productId: "sugar", quantity: 2, price: 5000 }],
    method: "Credit",
    customerId: "grace",
  }),
  op("pay", "payment", { customerId: "grace", amount: 4000, method: "Cash" }),
];
r = await sync.POST(req("sync", { operations }, cookie));
assert.equal(r.status, 200);
let d = await r.json();
assert.equal(d.accepted.length, 4);
assert.equal(d.state.products[0].quantity, 8);
assert.equal(d.state.sales.length, 1);
assert.equal(d.state.payments[0].amount, 4000);
const customerEdit = op("edit-customer", "customer-edit", {
  id: "grace", name: "Grace Updated", phone: "0700000000",
  base: { name: "Grace", phone: "" },
});
r = await sync.POST(req("sync", { operations: [customerEdit] }, cookie));
d = await r.json();
assert.equal(d.accepted[0], customerEdit.id);
assert.equal(d.state.customers[0].name, "Grace Updated");
r = await sync.POST(req("sync", { operations: [] }, cookie));
d = await r.json();
assert.equal(d.state.customers[0].phone, "0700000000", "Edited details must persist in relational storage");
assert.equal(d.state.sales[0].customerId, "grace");
assert.equal(d.state.payments[0].customerId, "grace");
r = await sync.POST(req("sync", { operations }, cookie));
d = await r.json();
assert.equal(d.state.sales.length, 1);
assert.equal(d.state.products[0].quantity, 8);
r = await sync.POST(
  req(
    "sync",
    {
      operations: [
        op("oversell", "sale", {
          items: [{ productId: "sugar", quantity: 9, price: 5000 }],
          method: "Cash",
        }),
      ],
    },
    cookie,
  ),
);
d = await r.json();
assert.equal(d.rejected.length, 1);
assert.equal(d.state.products[0].quantity, 8);
assert.equal(d.state.reviews.length, 1);
// Conflicts remain on the server with full sale details, and retry never applies them later.
assert.equal(d.state.reviews[0].operation.payload.items[0].quantity, 9);
r = await sync.POST(
  req(
    "sync",
    {
      operations: [
        op("restock", "adjust", { id: "sugar", delta: 20, reason: "Delivery" }),
        op("oversell", "sale", {
          items: [{ productId: "sugar", quantity: 9, price: 5000 }],
          method: "Cash",
        }),
      ],
    },
    cookie,
  ),
);
d = await r.json();
assert.equal(d.rejected.length, 1);
assert.equal(d.state.sales.length, 1);
assert.equal(d.state.products[0].quantity, 28);
r = await sync.POST(
  req(
    "sync",
    {
      operations: [
        op("review", "resolve", {
          id: "oversell",
          reason: "Checked physical stock; replacement receipt required",
        }),
      ],
    },
    cookie,
  ),
);
d = await r.json();
assert.equal(d.state.reviews[0].resolved, true);
assert.equal(d.state.reviews[0].history.length, 1);
r = await sync.POST(req("sync", { operations: [] }));
assert.equal(r.status, 401);
let other = await auth.POST(
  req("auth", { ...user, phone: "0700000002", business: "Other shop" }),
);
assert.equal(other.status, 200);
const otherCookie = other.headers.get("set-cookie").split(";")[0];
r = await sync.POST(req("sync", { operations: [] }, otherCookie));
d = await r.json();
assert.equal(d.state.products.length, 0);
for (let n = 0; n < 3; n++) {
  const attemptStarted = Date.now();
  r = await auth.POST(
    req("auth", {
      action: "login",
      phone: user.phone,
      password: "wrong-password",
    }),
  );
  assert.equal(r.status, 401);
  const failureState = db.prepare("SELECT failures,locked_until FROM accounts WHERE id=?").get(account.id);
  if (n < 2) {
    assert.equal(failureState.failures, n + 1);
    assert.equal(failureState.locked_until, 0);
  } else {
    assert(failureState.locked_until >= attemptStarted + 30000);
    assert(failureState.locked_until <= Date.now() + 30000);
  }
}
r = await auth.POST(
  req("auth", { action: "login", phone: user.phone, password: user.password }),
);
assert.equal(r.status, 429);
// Verify the exact lockout boundary without waiting or touching real accounts.
const lock = db.prepare("SELECT locked_until FROM accounts WHERE id=?").get(account.id);
const originalNow = Date.now;
try {
  Date.now = () => lock.locked_until - 1;
  r = await auth.POST(
    req("auth", { action: "login", phone: user.phone, password: user.password }),
  );
  assert.equal(r.status, 429, "Correct password must not bypass an active lock");
  Date.now = () => lock.locked_until;
  r = await auth.POST(
    req("auth", { action: "login", phone: user.phone, password: user.password }),
  );
  assert.equal(r.status, 200, "Sign-in must resume when the lock expires");
  const unlocked = db.prepare("SELECT failures,locked_until FROM accounts WHERE id=?").get(account.id);
  assert.equal(unlocked.failures, 0);
  assert.equal(unlocked.locked_until, 0);
} finally {
  Date.now = originalNow;
}
// Existing documents migrate lazily without altering the original snapshot.
const legacyRegistration = await auth.POST(
  req("auth", { ...user, phone: "0700000003", business: "Legacy shop" }),
);
const legacyCookie = legacyRegistration.headers.get("set-cookie").split(";")[0];
const legacyAccount = (await legacyRegistration.json()).account;
const legacyState = {
  products: [
    {
      id: "legacy-product",
      name: "Legacy sugar",
      price: 2000,
      quantity: 7,
      threshold: 2,
      updatedAt: 1,
    },
  ],
  customers: [],
  sales: [],
  payments: [],
  adjustments: [],
  applied: ["legacy-op"],
  reviews: [],
};
db.prepare("UPDATE workspaces SET data=?,version=42 WHERE account_id=?").run(
  JSON.stringify(legacyState),
  legacyAccount.id,
);
r = await sync.POST(req("sync", { operations: [] }, legacyCookie));
d = await r.json();
assert.equal(d.state.products[0].quantity, 7);
assert.equal(d.state.applied[0], "legacy-op");
assert.equal(
  JSON.parse(
    db
      .prepare("SELECT data FROM workspaces WHERE account_id=?")
      .get(legacyAccount.id).data,
  ).products[0].quantity,
  7,
);
const repository = await route("db/workspace.ts");
const read = await repository.readWorkspace(
  globalThis.__dukaTestEnv.DB,
  legacyAccount.id,
);
const first = structuredClone(read.state),
  second = structuredClone(read.state);
first.products[0].quantity = 8;
second.products[0].quantity = 99;
assert.equal(
  await repository.commitWorkspace(
    globalThis.__dukaTestEnv.DB,
    legacyAccount,
    first,
    read.version,
    [],
    read.state,
  ),
  true,
);
assert.equal(
  await repository.commitWorkspace(
    globalThis.__dukaTestEnv.DB,
    legacyAccount,
    second,
    read.version,
    [],
    read.state,
  ),
  false,
);
assert.equal(
  (
    await repository.readWorkspace(
      globalThis.__dukaTestEnv.DB,
      legacyAccount.id,
    )
  ).state.products[0].quantity,
  8,
);
const invalid = structuredClone(first);
invalid.products[0].quantity = -1;
await assert.rejects(
  repository.commitWorkspace(
    globalThis.__dukaTestEnv.DB,
    legacyAccount,
    invalid,
    read.version + 1,
    [],
    first,
  ),
);
assert.equal(
  (
    await repository.readWorkspace(
      globalThis.__dukaTestEnv.DB,
      legacyAccount.id,
    )
  ).version,
  read.version + 1,
);
// Restore identity is enforced on the server, not only in the file picker.
r = await sync.POST(
  req(
    "sync",
    {
      operations: [
        op("wrong-business-restore", "restore", {
          businessId: account.id,
          state: legacyState,
        }),
      ],
    },
    legacyCookie,
  ),
);
d = await r.json();
assert.equal(d.rejected.length, 1);
assert.match(d.rejected[0].message, /another business/);
assert.equal(
  (
    await sync.POST(
      req("sync", { businessId: account.id, operations: [] }, legacyCookie),
    )
  ).status,
  409,
);
// Password changes revoke every session and require the current password.
r = await auth.POST(
  req(
    "auth",
    {
      action: "change-password",
      currentPassword: "incorrect",
      newPassword: "new-password-123",
    },
    otherCookie,
  ),
);
assert.equal(r.status, 401);
r = await auth.POST(
  req(
    "auth",
    {
      action: "change-password",
      currentPassword: user.password,
      newPassword: "new-password-123",
    },
    otherCookie,
  ),
);
assert.equal(r.status, 200);
assert.equal(
  (await sync.POST(req("sync", { operations: [] }, otherCookie))).status,
  401,
);
db.prepare("UPDATE accounts SET email=? WHERE phone=?").run("other@example.com", "256700000002");
db.prepare("UPDATE accounts SET email=? WHERE phone=?").run("legacy@example.com", "256700000003");
const recovery = await route("recovery");
// Brevo integration uses fake credentials and a mocked HTTP provider only.
{
  const emailModule = await route("lib/recovery-email.ts");
  const config = { BREVO_API_KEY: "fake-provider-key", BREVO_SENDER_EMAIL: "sender@example.com", DUKATRACK_APP_URL: "https://duka.test" };
  assert.equal(emailModule.recoveryEmailConfigured(config), true);
  assert.equal(emailModule.recoveryEmailConfigured({ ...config, DUKATRACK_APP_URL: "http://public.example" }), false);
  assert.equal(emailModule.recoveryEmailConfigured({ ...config, DUKATRACK_APP_URL: "https://user:password@duka.test" }), false);
  assert.equal(emailModule.recoveryEmailConfigured({ ...config, BREVO_API_KEY: "" }), false);
  const originalFetch = globalThis.fetch;
  let sent, providerCalls = 0;
  Object.assign(globalThis.__dukaTestEnv, config);
  try {
    globalThis.fetch = async (url, options) => {
      providerCalls++;
      assert.equal(url, "https://api.brevo.com/v3/smtp/email");
      assert.equal(options.headers["api-key"], config.BREVO_API_KEY);
      sent = JSON.parse(options.body);
      return Response.json({ messageId: "fake-message-id" }, { status: 201 });
    };
    const requested = await recovery.POST(req("recovery", { action: "request", email: "OWNER@EXAMPLE.COM" }));
    assert.equal(requested.status, 200);
    assert.equal(sent.to[0].email, "owner@example.com");
    assert.equal(sent.sender.email, "sender@example.com");
    const link = sent.textContent.match(/https:\/\/duka\.test\/reset-password#token=([a-f0-9]{64})/);
    assert(link, "Email must contain the trusted reset link");
    assert(!JSON.stringify(await requested.json()).includes(link[1]), "Never return a reset token to the requesting browser");
    assert.equal((await recovery.POST(req("recovery", { action: "reset", token: link[1], newPassword: "email-reset-password" }))).status, 200);
    const callsBefore = providerCalls;
    assert.equal((await recovery.POST(req("recovery", { action: "request", email: "unknown@example.com" }))).status, 200);
    assert.equal(providerCalls, callsBefore, "Unknown accounts must not receive mail");
    globalThis.fetch = async () => new Response("Provider rejection", { status: 401 });
    assert.equal(await emailModule.sendRecoveryEmail(config, "owner@example.com", "a".repeat(64)), false);
    globalThis.fetch = async () => Response.json({});
    assert.equal(await emailModule.sendRecoveryEmail(config, "owner@example.com", "a".repeat(64)), false);
    globalThis.fetch = async () => { throw Error("Network error"); };
    assert.equal(await emailModule.sendRecoveryEmail(config, "owner@example.com", "a".repeat(64)), false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(config)) delete globalThis.__dukaTestEnv[key];
  }
}
assert.equal(
  (
    await recovery.POST(
      req("recovery", { action: "request", email: "other@example.com" }),
    )
  ).status,
  503,
);
let delivered;
globalThis.__dukaTestEnv.RECOVERY_EMAIL_DELIVERY = {
  async fetch(url, options) {
    delivered = JSON.parse(options.body);
    return new Response("{}");
  },
};
assert.equal(
  (
    await recovery.POST(
      req("recovery", { action: "request", email: "other@example.com" }),
    )
  ).status,
  200,
);
assert.equal(delivered.token.length, 64);
assert.equal(
  (
    await recovery.POST(
      req("recovery", { action: "request", email: "other@example.com" }),
    )
  ).status,
  429,
);
assert.equal(
  (
    await recovery.POST(
      req("recovery", {
        action: "reset",
        token: delivered.token,
        newPassword: "recovered-password-123",
      }),
    )
  ).status,
  200,
);
assert.equal(
  (
    await recovery.POST(
      req("recovery", {
        action: "reset",
        token: delivered.token,
        newPassword: "another-password-123",
      }),
    )
  ).status,
  400,
);
assert.equal(
  (
    await auth.POST(
      req("auth", {
        action: "login",
        phone: "0700000002",
        password: "recovered-password-123",
      }),
    )
  ).status,
  200,
);
const audit = await route("audit");
let auditResponse = await audit.GET(
  new Request("https://duka.test/api/audit", { headers: { Cookie: cookie } }),
);
assert.equal(auditResponse.status, 200);
const events = (await auditResponse.json()).events;
assert(events.every((x) => x.actor === "QA Owner"));
assert(
  !events.some(
    (x) => JSON.parse(x.payload).operation?.id === "wrong-business-restore",
  ),
);
assert.equal(
  (await audit.GET(new Request("https://duka.test/api/audit"))).status,
  401,
);
assert.equal(
  (
    await recovery.POST(
      req("recovery", { action: "request", email: "legacy@example.com" }),
    )
  ).status,
  200,
);
db.prepare("UPDATE recovery_tokens SET expires=0").run();
assert.equal(
  (
    await recovery.POST(
      req("recovery", {
        action: "reset",
        token: delivered.token,
        newPassword: "expired-password-123",
      }),
    )
  ).status,
  400,
);
// A full credit reversal records the cash refund already repaid, leaving zero debt.
r = await sync.POST(
  req(
    "sync",
    {
      operations: [
        op("reverse-credit", "correction", {
          saleId: "s",
          kind: "reversal",
          reason: "Customer returned both bags",
          refund: 4000,
        }),
      ],
    },
    cookie,
  ),
);
d = await r.json();
assert.equal(d.rejected.length, 0);
assert.equal(d.state.corrections[0].total, 10000);
assert.equal(d.state.products[0].quantity, 30);
assert.equal(d.state.sales.length, 1);
r = await sync.POST(
  req(
    "sync",
    {
      operations: [
        op("reverse-again", "correction", {
          saleId: "s",
          kind: "reversal",
          reason: "Duplicate attempt",
          refund: 4000,
        }),
      ],
    },
    cookie,
  ),
);
d = await r.json();
assert.equal(d.rejected.length, 1);
assert.equal(d.state.corrections.length, 1);
assert.equal(
  db
    .prepare("SELECT quantity FROM products WHERE business_id=? AND id=?")
    .get(account.id, "sugar").quantity,
  30,
);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM audit_events WHERE business_id=? AND action=?",
    )
    .get(account.id, "correction").n,
  2,
);
assert.equal(
  db
    .prepare("SELECT price FROM sale_items WHERE business_id=? AND sale_id=?")
    .get(account.id, "s").price,
  5000,
);
// Server session expiry is enforced independently of browser cookie expiry.
const expired = await auth.POST(
  req("auth", {
    action: "login",
    phone: "0700000002",
    password: "recovered-password-123",
  }),
);
const expiredCookie = expired.headers.get("set-cookie").split(";")[0];
db.prepare("UPDATE sessions SET expires=0 WHERE account_id<>?").run(account.id);
assert.equal(
  (await sync.POST(req("sync", { operations: [] }, expiredCookie))).status,
  401,
);
const csrf = new Request("https://duka.test/api/sync", {
  method: "POST",
  headers: {
    Origin: "https://other.test",
    Cookie: cookie,
    "Content-Type": "application/json",
  },
  body: '{"operations":[]}',
});
assert.equal((await sync.POST(csrf)).status, 403);
assert.equal(
  (await auth.POST(req("auth", { action: "logout" }, cookie))).status,
  200,
);
assert.equal(
  (await sync.POST(req("sync", { operations: [] }, cookie))).status,
  401,
);
console.log(
  "PASS: account isolation, validation, idempotent sync, retained conflicts/reviews, additive migration, stale-write/rollback protection, password changes/recovery/expiry, audit access, credit reversals, historical prices and sessions.",
);
db.close();
