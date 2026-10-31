import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler/package.json"))(
    "esbuild",
  );
const r = await build({
  entryPoints: ["lib/domain.ts", "lib/backup.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  outdir: "unused",
});
const mod = async (suffix) =>
  import(
    "data:text/javascript;base64," +
      Buffer.from(
        r.outputFiles.find((x) => x.path.endsWith(suffix)).text,
      ).toString("base64")
  );
const { empty, apply, balance, snapshotSale } = await mod("domain.js"),
  { parseBackup, mergeBackup } = await mod("backup.js");
let state = empty();
let n = 0;
const op = (type, payload) => ({ id: "op" + ++n, at: n, type, payload });
state = apply(
  state,
  op("product", {
    id: "sugar",
    name: "Sugar",
    price: 5000,
    quantity: 10,
    threshold: 2,
  }),
);
state = apply(state, op("customer", { id: "c", name: "Customer", phone: "" }));
state = apply(
  state,
  op("sale", {
    items: [{ productId: "sugar", quantity: 2, price: 5000 }],
    method: "Credit",
    customerId: "c",
  }),
);
state = apply(
  state,
  op("payment", { customerId: "c", amount: 4000, method: "Cash" }),
);
const backup = {
  format: "dukatrack-v1",
  business: { id: "a", business: "Shop" },
  exportedAt: 5,
  state,
  operations: [],
};
const parsed = parseBackup(JSON.stringify(backup), "a");
assert.equal(mergeBackup(empty(), parsed.state).sales.length, 1);
assert.equal(mergeBackup(state, parsed.state).sales.length, 1);
assert.throws(
  () => parseBackup(JSON.stringify(backup), "b"),
  /another business/,
);
assert.throws(
  () => parseBackup(JSON.stringify({ ...backup, schemaVersion: 99 }), "a"),
  /version/,
);
const bad = structuredClone(backup);
bad.state.sales[0].total = 1;
assert.throws(() => parseBackup(JSON.stringify(bad), "a"), /total/);
const collision = structuredClone(state);
collision.products[0].quantity = 100;
assert.throws(() => mergeBackup(collision, parsed.state), /conflicts/);
const reversed = apply(
  state,
  op("correction", {
    saleId: "op3",
    kind: "reversal",
    reason: "Returned",
    refund: 4000,
  }),
);
assert.equal(balance(reversed, "c"), 0);
assert.equal(reversed.products[0].quantity, 10);
assert.equal(state.products[0].quantity, 8);
assert.equal(
  parseBackup(JSON.stringify({ ...backup, state: reversed }), "a").state
    .corrections.length,
  1,
);
assert.throws(
  () =>
    apply(
      reversed,
      op("correction", {
        saleId: "op3",
        kind: "return",
        items: [{ productId: "sugar", quantity: 1 }],
        reason: "Too many",
        refund: 0,
      }),
    ),
  /remaining/,
);
const restored = apply(empty(), op("restore", { state: parsed.state }));
assert.equal(restored.sales.length, 1);
assert.equal(
  apply(restored, op("restore", { state: parsed.state })).sales.length,
  1,
);
console.log(
  "PASS: backup schema/account/integrity checks, duplicate merge, overwrite rejection, restoration, credit reversal and excess returns.",
);

const base = state.products[0],
  edit = op("product", {
    ...base,
    name: "Updated sugar",
    baseRevision: base.revision,
    base: base.updatedAt,
  });
edit.at = base.updatedAt;
const edited = apply(state, edit);
const stale = op("product", {
  ...base,
  name: "Stale sugar",
  baseRevision: base.revision,
  base: base.updatedAt,
});
stale.at = base.updatedAt;
assert.throws(() => apply(edited, stale), /changed on another device/);
assert.equal(state.products[0].name, "Sugar");
console.log(
  "PASS: same-timestamp product edits use operation revisions to reject stale writes.",
);

const cash = apply(
  state,
  op("sale", {
    items: [{ productId: "sugar", quantity: 1, price: 5000 }],
    method: "Cash",
  }),
);
const cashRoundTrip = parseBackup(
  JSON.stringify({ ...backup, state: cash }),
  "a",
);
assert.equal(mergeBackup(cash, cashRoundTrip.state).sales.length, 2);
console.log(
  "PASS: JSON round-trip of optional cash-sale fields does not create false restore conflicts.",
);

const malformedBusiness = structuredClone(backup);
malformedBusiness.business.business = { name: "Invalid" };
assert.throws(
  () => parseBackup(JSON.stringify(malformedBusiness), "a"),
  /business name/,
);
const invalidTime = structuredClone(backup);
invalidTime.state.sales[0].at = Number.MAX_SAFE_INTEGER;
assert.throws(
  () => parseBackup(JSON.stringify(invalidTime), "a"),
  /Invalid sale/,
);
console.log(
  "PASS: malformed preview metadata and out-of-range report dates are rejected.",
);

const captured = snapshotSale(state, {
  items: [{ productId: "sugar", quantity: 1, price: 5000 }],
  method: "Credit",
  customerId: "c",
});
assert.equal(captured.items[0].name, "Sugar");
assert.equal(captured.customerSnapshot.name, "Customer");
assert.equal(captured.total, 5000);
const renamed = structuredClone(state);
renamed.products[0].name = "Renamed sugar";
const historical = apply(renamed, op("sale", captured));
assert.equal(historical.sales.at(-1).items[0].name, "Sugar");
console.log(
  "PASS: offline sale evidence preserves original product/customer details and receipt totals.",
);
