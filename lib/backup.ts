import type { State, Operation } from "./domain";
import type { Bundle } from "./sync";
const fail = (message: string): never => {
  throw Error(message);
};
const record = (x: unknown): Record<string, any> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, any>)
    : fail("Invalid backup record.");
const id = (x: unknown) =>
  typeof x === "string" && x.length > 0 && x.length <= 120;
const integer = (x: unknown) =>
  Number.isSafeInteger(x) &&
  Number(x) >= 0 &&
  Number(x) <= Number.MAX_SAFE_INTEGER;
const timestamp = (x: unknown) => integer(x) && Number(x) <= 8640000000000000;
export function validateState(value: unknown): State {
  const s = structuredClone(record(value));
  if (s.corrections === undefined) s.corrections = [];
  if (!Array.isArray(s.corrections)) fail("Invalid correction history.");
  for (const key of [
    "products",
    "customers",
    "sales",
    "payments",
    "adjustments",
    "applied",
    "reviews",
  ])
    if (!Array.isArray(s[key])) fail("Missing backup collection: " + key);
  for (const key of [
    "products",
    "customers",
    "sales",
    "payments",
    "adjustments",
    "reviews",
    "corrections",
  ]) {
    const ids = new Set();
    for (const raw of s[key]) {
      const x = record(raw);
      if (!id(x.id) || ids.has(x.id))
        fail("Duplicate or invalid " + key + " identity.");
      ids.add(x.id);
    }
  }
  const products = new Set(s.products.map((p: any) => p.id)),
    customers = new Set(s.customers.map((c: any) => c.id));
  for (const p of s.products)
    if (
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 120 ||
      ![p.price, p.quantity, p.threshold].every(integer) ||
      !timestamp(p.updatedAt) ||
      p.quantity > 1e9 ||
      p.price > 1e9 ||
      p.threshold > 1e9 ||
      (p.archived !== undefined && typeof p.archived !== "boolean") ||
      (p.revision !== undefined && !id(p.revision))
    )
      fail("Invalid product in backup.");
  for (const c of s.customers)
    if (
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 120 ||
      typeof c.phone !== "string" ||
      c.phone.length > 25
    )
      fail("Invalid customer in backup.");
  const transactionIds = new Set<string>();
  for (const sale of s.sales) {
    if (transactionIds.has(sale.id)) fail("Duplicate transaction identity.");
    transactionIds.add(sale.id);
    if (
      !timestamp(sale.at) ||
      !integer(sale.total) ||
      sale.total <= 0 ||
      !["Cash", "MTN Mobile Money", "Airtel Money", "Credit"].includes(
        sale.method,
      ) ||
      !Array.isArray(sale.items) ||
      !sale.items.length ||
      sale.items.length > 200
    )
      fail("Invalid sale in backup.");
    if (
      (sale.method === "Credit" || sale.customerId !== undefined) &&
      !customers.has(sale.customerId)
    )
      fail("Missing credit customer.");
    const seen = new Set();
    let total = 0;
    for (const i of sale.items) {
      if (
        !products.has(i.productId) ||
        seen.has(i.productId) ||
        typeof i.name !== "string" ||
        !i.name.trim() ||
        !integer(i.quantity) ||
        i.quantity <= 0 ||
        i.quantity > 1e9 ||
        !integer(i.price) ||
        i.price > 1e9
      )
        fail("Invalid sale item.");
      seen.add(i.productId);
      total += i.price * i.quantity;
    }
    if (!Number.isSafeInteger(total) || total !== sale.total || total > 1e9)
      fail("Sale total does not match its items.");
  }
  for (const p of s.payments) {
    if (transactionIds.has(p.id)) fail("Duplicate transaction identity.");
    transactionIds.add(p.id);
    if (
      !customers.has(p.customerId) ||
      !timestamp(p.at) ||
      !integer(p.amount) ||
      p.amount <= 0 ||
      p.amount > 1e9 ||
      !["Cash", "MTN Mobile Money", "Airtel Money"].includes(p.method)
    )
      fail("Invalid repayment.");
  }
  for (const c of s.customers) {
    const reduction = s.corrections
      .filter((x: any) => x.customerId === c.id)
      .reduce((a: number, x: any) => a + x.creditReduction - x.refund, 0);
    const owed = s.sales
        .filter((x: any) => x.method === "Credit" && x.customerId === c.id)
        .reduce((a: number, x: any) => a + x.total, 0),
      paid = s.payments
        .filter((x: any) => x.customerId === c.id)
        .reduce((a: number, x: any) => a + x.amount, 0);
    if (paid > owed - reduction) fail("Repayments exceed customer credit.");
  }
  for (const x of s.adjustments) {
    if (
      !Number.isSafeInteger(x.delta) ||
      !x.delta ||
      Math.abs(x.delta) > 1e9 ||
      typeof x.reason !== "string" ||
      !x.reason.trim() ||
      !timestamp(x.at) ||
      (x.productId !== undefined && !products.has(x.productId))
    )
      fail("Invalid stock adjustment.");
  }
  for (const c of s.corrections) {
    const sale = s.sales.find((x: any) => x.id === c.saleId);
    if (
      !id(c.id) ||
      transactionIds.has(c.id) ||
      !sale ||
      !timestamp(c.at) ||
      typeof c.reason !== "string" ||
      !c.reason.trim() ||
      !["return", "reversal"].includes(c.kind) ||
      !Array.isArray(c.items) ||
      !c.items.length ||
      !integer(c.refund) ||
      !integer(c.creditReduction)
    )
      fail("Invalid correction record.");
    transactionIds.add(c.id);
    let total = 0;
    const seen = new Set();
    for (const i of c.items) {
      const original = sale.items.find((x: any) => x.productId === i.productId);
      if (
        !original ||
        seen.has(i.productId) ||
        !integer(i.quantity) ||
        !i.quantity
      )
        fail("Invalid return item.");
      seen.add(i.productId);
      const returned = s.corrections
        .filter((x: any) => x.saleId === sale.id)
        .reduce(
          (a: number, x: any) =>
            a +
            x.items
              .filter((j: any) => j.productId === i.productId)
              .reduce((n: number, j: any) => n + j.quantity, 0),
          0,
        );
      if (returned > original.quantity) fail("Returns exceed original sale.");
      total += original.price * i.quantity;
    }
    if (
      total !== c.total ||
      c.customerId !== sale.customerId ||
      c.creditReduction !== (sale.method === "Credit" ? total : 0) ||
      c.refund > total ||
      (c.refundMethod !== undefined &&
        !["Cash", "MTN Mobile Money", "Airtel Money"].includes(
          c.refundMethod,
        )) ||
      (sale.method !== "Credit" && c.refund !== total)
    )
      fail("Correction totals do not match the sale.");
  }
  for (const r of s.reviews)
    if (
      typeof r.message !== "string" ||
      !timestamp(r.at) ||
      (r.resolved !== undefined && typeof r.resolved !== "boolean") ||
      (r.operation && r.operation.id !== r.id)
    )
      fail("Invalid conflict record.");
  for (const review of s.reviews)
    if (s.applied.includes(review.id))
      fail("An operation cannot be both applied and rejected.");
  if (!s.applied.every(id) || new Set(s.applied).size !== s.applied.length)
    fail("Invalid applied-operation history.");
  for (const x of [
    ...s.sales,
    ...s.payments,
    ...s.adjustments,
    ...s.corrections,
  ])
    if (!s.applied.includes(x.id))
      fail("Transaction is missing its operation identity.");
  return structuredClone(s) as State;
}
const canonical = (x: unknown): string => {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object")
    return (
      "{" +
      Object.entries(x)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(x);
};
export function mergeBackup(current: State, source: State): State {
  const incoming = validateState(source),
    merged = validateState(current);
  for (const key of [
    "products",
    "customers",
    "sales",
    "payments",
    "adjustments",
    "reviews",
    "corrections",
  ] as const) {
    if (key === "corrections" && !merged.corrections) merged.corrections = [];
    const rows = merged[key] as { id: string }[];
    for (const row of incoming[key] || []) {
      const existing = rows.find((x) => x.id === row.id);
      if (existing) {
        if (canonical(existing) !== canonical(row))
          fail(
            "Backup conflicts with existing " +
              key +
              " record " +
              row.id +
              ". No records were overwritten.",
          );
      } else rows.push(row);
    }
  }
  merged.applied = [...new Set([...current.applied, ...incoming.applied])];
  return validateState(merged);
}
export type Backup = {
  format: "dukatrack-v1";
  schemaVersion?: 1;
  business: { id: string; business: string };
  state: State;
  operations: Operation[];
  exportedAt: number;
};
export function createBackup(business: Backup["business"], bundle: Bundle, exportedAt = Date.now()) {
  return {
    format: "dukatrack-v1" as const,
    schemaVersion: 1 as const,
    business: structuredClone(business),
    exportedAt,
    ...structuredClone(bundle),
  };
}
export function mergeBusinessBackup(current: State, source: Backup, accountId: string): State {
  if (source.business.id !== accountId)
    fail("This backup belongs to another business. Sign in to the original business.");
  return mergeBackup(current, source.state);
}
export function parseBackup(text: string, accountId: string): Backup {
  if (new TextEncoder().encode(text).length > 400000)
    fail("Backup exceeds the supported 400 KB import limit.");
  const b = record(JSON.parse(text));
  if (
    b.format !== "dukatrack-v1" ||
    (b.schemaVersion !== undefined && b.schemaVersion !== 1)
  )
    fail("Unsupported backup version.");
  if (
    typeof record(b.business).business !== "string" ||
    !b.business.business.trim()
  )
    fail("Invalid business name in backup.");
  if (b.business.id !== accountId)
    fail(
      "This backup belongs to another business. Sign in to the original business.",
    );
  if (!timestamp(b.exportedAt) || !Array.isArray(b.operations))
    fail("Invalid backup metadata.");
  b.state = validateState(b.state);
  for (const op of b.operations)
    if (
      !id(op.id) ||
      (!b.state.applied.includes(op.id) &&
        !b.state.reviews.some((r: any) => r.id === op.id))
    )
      fail("Pending operation is not represented in backup records.");
  return b as Backup;
}

export const sameRecords = (a: State, b: State) =>
  canonical(a) === canonical(b);
