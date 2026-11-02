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
// Customer balances are isolated and repayments cannot exceed the debt.
{
  let sequence = 0;
  const operation = (type, payload) => ({
    id: "credit-test-" + ++sequence, at: sequence, type, payload,
  });
  let creditState = empty();
  const customer = operation("customer", { id: "a", name: "  Customer A  ", phone: "" });
  creditState = apply(creditState, customer);
  assert.equal(creditState.customers[0].name, "Customer A");
  assert.equal(creditState.customers[0].phone, "");
  assert.deepEqual(apply(creditState, customer), creditState);
  creditState = apply(creditState, operation("customer", { id: "b", name: "Customer B", phone: "0700000000" }));
  for (const invalid of [{ name: " " }, { name: "x".repeat(121) }, { phone: 123 }, { phone: "x".repeat(26) }, { id: "" }]) {
    assert.throws(() => apply(creditState, operation("customer", {
      id: "invalid", name: "Customer", phone: "", ...invalid,
    })));
  }
  creditState = apply(creditState, operation("product", {
    id: "rice", name: "Rice", price: 3000, quantity: 10, threshold: 2,
  }));
  const items = [{ productId: "rice", quantity: 1, price: 3000 }];
  for (const customerId of [undefined, "missing"]) {
    assert.throws(() => apply(creditState, operation("sale", { items, method: "Credit", customerId })), /credit customer/);
  }
  for (const customerId of ["a", "a", "b"]) {
    creditState = apply(creditState, operation("sale", { items, method: "Credit", customerId }));
  }
  assert.equal(balance(creditState, "a"), 6000);
  assert.equal(balance(creditState, "b"), 3000);
  const repayment = operation("payment", { customerId: "a", amount: 2000, method: "Cash" });
  creditState = apply(creditState, repayment);
  assert.equal(balance(creditState, "a"), 4000);
  assert.equal(balance(creditState, "b"), 3000);
  assert.deepEqual(apply(creditState, repayment), creditState);
  const before = structuredClone(creditState);
  for (const invalid of [
    { amount: 4001 }, { amount: 0 }, { amount: -1 }, { amount: 1.5 },
    { amount: Number.NaN }, { amount: Number.POSITIVE_INFINITY }, { customerId: "missing" },
  ]) {
    assert.throws(() => apply(creditState, operation("payment", {
      customerId: "a", amount: 1, method: "Cash", ...invalid,
    })), /outstanding balance/);
    assert.deepEqual(creditState, before);
  }
  creditState = apply(creditState, operation("payment", { customerId: "a", amount: 4000, method: "Airtel Money" }));
  assert.equal(balance(creditState, "a"), 0);
  assert.equal(balance(creditState, "b"), 3000);
  assert.throws(() => apply(creditState, operation("payment", { customerId: "a", amount: 1, method: "Cash" })));
  assert.equal(creditState.sales.length, 3);
  assert.equal(creditState.payments.length, 2);
  const customerBefore = creditState.customers.find((c) => c.id === "a");
  const editCustomer = operation("customer-edit", {
    id: "a", name: "  Updated customer  ", phone: " 0700000000 ",
    base: { name: customerBefore.name, phone: customerBefore.phone },
  });
  const editedCustomer = apply(creditState, editCustomer);
  assert.equal(editedCustomer.customers[0].name, "Updated customer");
  assert.equal(editedCustomer.customers[0].phone, "0700000000");
  assert.deepEqual(editedCustomer.sales, creditState.sales);
  assert.deepEqual(editedCustomer.payments, creditState.payments);
  assert.equal(balance(editedCustomer, "a"), 0);
  assert.equal(balance(editedCustomer, "b"), 3000);
  assert.deepEqual(apply(editedCustomer, editCustomer), editedCustomer);
  assert.throws(() => apply(editedCustomer, operation("customer-edit", editCustomer.payload)), /changed on another device/);
  for (const invalid of [{ name: " " }, { phone: "x".repeat(26) }, { id: "missing" }]) {
    assert.throws(() => apply(creditState, operation("customer-edit", {
      ...editCustomer.payload, ...invalid,
    })));
  }
  console.log("PASS: customer validation, cumulative isolated credit balances, partial/full repayments, duplicate retry and overpayment protection.");
}
// Each recorded payment method survives sales, repayments and backup restoration.
{
  let sequence = 0;
  const operation = (type, payload) => ({
    id: "method-test-" + ++sequence, at: sequence, type, payload,
  });
  let recorded = apply(empty(), operation("product", {
    id: "rice", name: "Rice", price: 3000, quantity: 10, threshold: 2,
  }));
  recorded = apply(recorded, operation("customer", { id: "customer", name: "Customer", phone: "" }));
  const items = [{ productId: "rice", quantity: 1, price: 3000 }];
  const methods = ["Cash", "MTN Mobile Money", "Airtel Money"];
  for (const method of methods) {
    recorded = apply(recorded, operation("sale", { items, method }));
  }
  recorded = apply(recorded, operation("sale", {
    items, method: "Credit", customerId: "customer",
  }));
  for (const method of methods) {
    recorded = apply(recorded, operation("payment", {
      customerId: "customer", amount: 500, method,
    }));
  }
  assert.deepEqual(recorded.sales.map((s) => s.method), [...methods, "Credit"]);
  assert.deepEqual(recorded.payments.map((p) => p.method), methods);
  assert.equal(balance(recorded, "customer"), 1500);
  const restored = mergeBackup(empty(), parseBackup(JSON.stringify({
    format: "dukatrack-v1", business: { id: "methods", business: "Shop" },
    exportedAt: 100, state: recorded, operations: [],
  }), "methods").state);
  assert.deepEqual(restored.sales, JSON.parse(JSON.stringify(recorded.sales)));
  assert.deepEqual(restored.payments, recorded.payments);
  for (const method of ["Mobile Money", "MTN", "Airtel", "cash", "Bank transfer", ""]) {
    assert.throws(() => apply(recorded, operation("sale", { items, method })));
    assert.throws(() => apply(recorded, operation("payment", {
      customerId: "customer", amount: 1, method,
    })));
  }
  assert.throws(() => apply(recorded, operation("payment", {
    customerId: "customer", amount: 1, method: "Credit",
  })));
  console.log("PASS: separate cash/MTN/Airtel sales and repayments, backup method preservation and unsupported-method rejection.");
}
// A multi-item sale either commits completely or leaves all stock unchanged.
{
  let sequence = 0;
  const operation = (type, payload) => ({
    id: "sale-test-" + ++sequence, at: sequence, type, payload,
  });
  let initial = empty();
  for (const product of [
    { id: "rice", name: "Rice", price: 3000, quantity: 5, threshold: 2 },
    { id: "soap", name: "Soap", price: 1500, quantity: 4, threshold: 1 },
  ]) initial = apply(initial, operation("product", product));
  const items = [
    { productId: "rice", quantity: 2, price: 3000 },
    { productId: "soap", quantity: 4, price: 1500 },
  ];
  const sale = operation("sale", { items, method: "Cash", total: 12000 });
  const sold = apply(initial, sale);
  assert.equal(sold.sales.length, 1);
  assert.equal(sold.sales[0].total, 12000);
  assert.equal(sold.sales[0].id, sale.id);
  assert.equal(sold.sales[0].at, sale.at);
  assert.equal(sold.sales[0].items[0].name, "Rice");
  assert.deepEqual(sold.products.map((p) => p.quantity), [3, 0]);
  assert.deepEqual(apply(sold, sale), sold, "Retry must not sell or deduct stock twice");
  const before = structuredClone(initial);
  for (const invalid of [
    { items: [] }, { items: [...items, items[0]] },
    { total: 1 }, { method: "Unknown" },
    ...[0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 5].map((quantity) => ({
      items: [items[0], { ...items[1], quantity }],
    })),
    { items: [items[0], { ...items[1], productId: "missing" }] },
    { items: [items[0], { ...items[1], price: 1 }] },
  ]) {
    assert.throws(() => apply(initial, operation("sale", {
      items, method: "Cash", total: 12000, ...invalid,
    })));
    assert.deepEqual(initial, before, "Invalid later item must not deduct earlier stock");
  }
  const archived = apply(initial, operation("archive", { id: "soap" }));
  assert.throws(() => apply(archived, operation("sale", { items, method: "Cash" })));
  console.log("PASS: multi-item sale totals, stock deduction, last-unit sale, duplicate retry and atomic rejection of invalid sales.");
}
// Adjustment failures must leave inventory and its history unchanged.
{
  let sequence = 0;
  const operation = (type, payload) => ({
    id: "adjust-test-" + ++sequence, at: sequence, type, payload,
  });
  const initial = apply(empty(), operation("product", {
    id: "rice", name: "Rice", price: 3000, quantity: 5, threshold: 2,
  }));
  const addition = operation("adjust", { id: "rice", delta: 3, reason: "Delivery received" });
  const stocked = apply(initial, addition);
  assert.equal(stocked.products[0].quantity, 8);
  assert.equal(stocked.adjustments.length, 1);
  assert.equal(stocked.adjustments[0].productId, "rice");
  assert.equal(stocked.adjustments[0].reason, "Delivery received");
  assert.equal(stocked.adjustments[0].delta, 3);
  assert.equal(stocked.adjustments[0].at, addition.at);
  assert.equal(stocked.adjustments[0].id, addition.id);
  assert.deepEqual(apply(stocked, addition), stocked, "Retry must not adjust stock twice");
  const reduced = apply(stocked, operation("adjust", { id: "rice", delta: -8, reason: "Damaged stock" }));
  assert.equal(reduced.products[0].quantity, 0);
  assert.equal(reduced.adjustments.length, 2);
  assert.equal(initial.products[0].quantity, 5);
  const before = structuredClone(stocked);
  for (const invalid of [
    { delta: -9 }, { delta: 0 }, { delta: 1.5 },
    { delta: Number.NaN }, { delta: Number.POSITIVE_INFINITY },
    { delta: 1000000000 }, { reason: "   " }, { reason: "x".repeat(121) },
    { id: "missing-product" },
  ]) {
    assert.throws(() => apply(stocked, operation("adjust", {
      id: "rice", delta: 1, reason: "Delivery", ...invalid,
    })), /quantity.*reason/);
    assert.deepEqual(stocked, before);
  }
  const archived = apply(stocked, operation("archive", { id: "rice" }));
  assert.throws(() => apply(archived, operation("adjust", {
    id: "rice", delta: 1, reason: "Delivery",
  })));
  console.log("PASS: reasoned stock additions/reductions, zero stock, retained history, duplicate retry and invalid adjustment protection.");
}
let n = 0;
const op = (type, payload) => ({ id: "op" + ++n, at: n, type, payload });
// Product edits preserve inventory, including zero-stock products.
{
  let productSequence = 0;
  const op = (type, payload) => ({
    id: "product-test-" + ++productSequence,
    at: productSequence, type, payload,
  });
  const product = {
    id: "product-check", name: "  Rice 1 kg  ", price: 3000,
    quantity: 0, threshold: 2,
  };
  const created = apply(empty(), op("product", product));
  assert.equal(created.products[0].name, "Rice 1 kg");
  assert.equal(created.products[0].quantity, 0);
  const original = structuredClone(created);
  const edited = apply(created, op("product", {
    ...product, name: "Rice", price: 3500, threshold: 4,
    quantity: 99, baseRevision: created.products[0].revision,
  }));
  assert.equal(edited.products[0].name, "Rice");
  assert.equal(edited.products[0].price, 3500);
  assert.equal(edited.products[0].threshold, 4);
  assert.equal(edited.products[0].quantity, 0);
  assert.deepEqual(created, original);
  for (const invalid of [
    { name: "   " }, { price: -1 }, { price: 1.5 },
    { quantity: -1 }, { quantity: 1.5 }, { threshold: -1 },
    { threshold: 1.5 }, { price: Number.NaN },
  ]) {
    assert.throws(() => apply(empty(), op("product", { ...product, ...invalid })));
  }
  assert.throws(() => apply(edited, op("product", {
    ...product, baseRevision: created.products[0].revision,
  })), /changed on another device/);
  console.log("PASS: product creation/edit validation, zero-stock preservation and stale-edit rejection.");
}
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
