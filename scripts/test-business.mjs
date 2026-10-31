import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))(
  "esbuild",
);
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const db = new DatabaseSync(":memory:");
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
  r = await auth.POST(
    req("auth", {
      action: "login",
      phone: user.phone,
      password: "wrong-password",
    }),
  );
  assert.equal(r.status, 401);
}
r = await auth.POST(
  req("auth", { action: "login", phone: user.phone, password: user.password }),
);
assert.equal(r.status, 429);
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
const recovery = await route("recovery");
assert.equal(
  (
    await recovery.POST(
      req("recovery", { action: "request", phone: "0700000002" }),
    )
  ).status,
  503,
);
let delivered;
globalThis.__dukaTestEnv.RECOVERY_DELIVERY = {
  async fetch(url, options) {
    delivered = JSON.parse(options.body);
    return new Response("{}");
  },
};
assert.equal(
  (
    await recovery.POST(
      req("recovery", { action: "request", phone: "0700000002" }),
    )
  ).status,
  200,
);
assert.equal(delivered.token.length, 64);
assert.equal(
  (
    await recovery.POST(
      req("recovery", { action: "request", phone: "0700000002" }),
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
      req("recovery", { action: "request", phone: "0700000003" }),
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
