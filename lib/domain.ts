import { mergeBackup } from "./backup";
import { isStockUnit } from "./units";
export type Product = {
  id: string;
  name: string;
  unit?: string;
  price: number;
  quantity: number;
  threshold: number;
  updatedAt: number;
  revision?: string;
  archived?: boolean;
};
export type Customer = { id: string; name: string; phone: string };
export type Sale = {
  id: string;
  at: number;
  items: { productId: string; name: string; quantity: number; price: number }[];
  total: number;
  method: string;
  customerId?: string;
};
export type Payment = {
  id: string;
  at: number;
  customerId: string;
  amount: number;
  method: string;
};
export type Review = {
  id: string;
  message: string;
  at: number;
  operation?: Operation;
  resolved?: boolean;
  resolvedAt?: number;
  resolution?: string;
  history?: { at: number; reason: string }[];
};
export type Correction = {
  id: string;
  saleId: string;
  at: number;
  kind: "return" | "reversal";
  items: { productId: string; quantity: number }[];
  total: number;
  reason: string;
  refund: number;
  creditReduction: number;
  refundMethod?: string;
  customerId?: string;
};
export type State = {
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  payments: Payment[];
  adjustments: {
    id: string;
    productId?: string;
    delta: number;
    reason: string;
    at: number;
  }[];
  applied: string[];
  corrections?: Correction[];
  reviews: Review[];
};
export type Operation = { id: string; type: string; at: number; payload: any };
export const empty = (): State => ({
  products: [],
  customers: [],
  sales: [],
  payments: [],
  adjustments: [],
  applied: [],
  reviews: [],
  corrections: [],
});
export const balance = (s: State, id: string) =>
  s.sales
    .filter((x) => x.customerId === id && x.method === "Credit")
    .reduce((a, x) => a + x.total, 0) -
  s.payments
    .filter((x) => x.customerId === id)
    .reduce((a, x) => a + x.amount, 0) -
  (s.corrections || [])
    .filter((x) => x.customerId === id)
    .reduce((a, x) => a + x.creditReduction - x.refund, 0);
const positive = (v: unknown, zero = false): v is number =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  (zero ? v >= 0 : v > 0) &&
  v <= 1000000000;
const label = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 120;
export function apply(input: State, op: Operation): State {
  if (input.applied.includes(op?.id)) return input;
  if (
    !op ||
    !label(op.id) ||
    !Number.isSafeInteger(op.at) ||
    op.at < 0 ||
    op.at > 8640000000000000 ||
    !op.payload ||
    typeof op.payload !== "object"
  )
    throw Error("Invalid record.");
  const s: State = structuredClone(input),
    p = op.payload;
  switch (op.type) {
    case "correction": {
      const sale = s.sales.find((x) => x.id === p.saleId);
      if (!sale || !label(p.reason) || !["return", "reversal"].includes(p.kind))
        throw Error("Select an original sale and provide a correction reason.");
      const previous = (s.corrections || []).filter(
        (x) => x.saleId === sale.id,
      );
      const remaining = sale.items.map((i) => ({
        ...i,
        quantity:
          i.quantity -
          previous.reduce(
            (a, c) =>
              a +
              (c.items.find((x) => x.productId === i.productId)?.quantity || 0),
            0,
          ),
      }));
      const requested =
        p.kind === "reversal"
          ? remaining.filter((i) => i.quantity > 0)
          : p.items;
      if (!Array.isArray(requested) || !requested.length)
        throw Error("No remaining items to correct.");
      const seen = new Set<string>();
      let total = 0;
      const items = requested.map((i: any) => {
        const original = remaining.find((x) => x.productId === i.productId);
        if (
          !original ||
          !positive(i.quantity) ||
          i.quantity > original.quantity ||
          seen.has(i.productId)
        )
          throw Error("Return exceeds the remaining sale quantity.");
        seen.add(i.productId);
        total += original.price * i.quantity;
        const product = s.products.find((x) => x.id === i.productId);
        if (!product || !positive(product.quantity + i.quantity, true))
          throw Error("Returned stock exceeds its allowed limit.");
        product.quantity += i.quantity;
        product.updatedAt = op.at;
        product.revision = op.id;
        return { productId: i.productId, quantity: i.quantity };
      });
      const creditReduction = sale.method === "Credit" ? total : 0;
      const refund =
        sale.method === "Credit"
          ? Math.max(0, total - balance(s, sale.customerId!))
          : total;
      const refundMethod =
        p.refundMethod || (sale.method === "Credit" ? "Cash" : sale.method);
      if (!["Cash", "MTN Mobile Money", "Airtel Money"].includes(refundMethod))
        throw Error("Select a valid refund method.");
      if (p.refund !== refund)
        throw Error(
          "Refund amount changed. Review the customer balance before correcting this sale.",
        );
      (s.corrections ||= []).push({
        id: op.id,
        saleId: sale.id,
        at: op.at,
        kind: p.kind,
        items,
        total,
        reason: p.reason.trim(),
        refund,
        refundMethod,
        creditReduction,
        customerId: sale.customerId,
      });
      break;
    }
    case "restore": {
      const restored = mergeBackup(s, p.state);
      Object.assign(s, restored);
      break;
    }
    case "product": {
      if (p.unit !== undefined && !isStockUnit(p.unit))
        throw Error("Select a valid stock unit.");
      if (
        !label(p.name) ||
        !positive(p.price, true) ||
        !positive(p.threshold, true)
      )
        throw Error("Enter a name and valid whole-number amounts.");
      const old = s.products.find((x) => x.id === p.id);
      if (old) {
        if (
          old.revision
            ? p.baseRevision !== old.revision
            : p.base !== old.updatedAt
        )
          throw Error(
            "This product changed on another device. Refresh and try again.",
          );
        Object.assign(old, {
          name: p.name.trim(),
          unit: p.unit?.trim() ?? old.unit ?? "Pieces",
          price: p.price,
          threshold: p.threshold,
          updatedAt: op.at,
          revision: op.id,
        });
      } else {
        if (!positive(p.quantity, true) || !label(p.id))
          throw Error("Invalid stock quantity.");
        s.products.push({
          id: p.id,
          name: p.name.trim(),
          unit: p.unit?.trim() ?? "Pieces",
          price: p.price,
          threshold: p.threshold,
          quantity: p.quantity,
          updatedAt: op.at,
          revision: op.id,
        });
      }
      break;
    }
    case "archive": {
      const x = s.products.find((x) => x.id === p.id);
      if (!x) throw Error("Product not found.");
      x.archived = true;
      x.updatedAt = op.at;
      x.revision = op.id;
      break;
    }
    case "adjust": {
      const x = s.products.find((x) => x.id === p.id && !x.archived);
      if (
        !x ||
        !Number.isSafeInteger(p.delta) ||
        !p.delta ||
        !label(p.reason) ||
        !positive(x.quantity + p.delta, true)
      )
        throw Error("Check quantity and provide a stock adjustment reason.");
      x.quantity += p.delta;
      x.updatedAt = op.at;
      x.revision = op.id;
      s.adjustments.push({ ...p, productId: p.id, at: op.at, id: op.id });
      break;
    }
    case "customer-edit": {
      const customer = s.customers.find((x) => x.id === p.id);
      if (!customer) throw Error("Customer not found.");
      if (!label(p.name) || typeof p.phone !== "string" || p.phone.length > 25)
        throw Error("Enter valid customer details.");
      if (p.base?.name !== customer.name || p.base?.phone !== customer.phone)
        throw Error("This customer changed on another device. Refresh and try again.");
      customer.name = p.name.trim();
      customer.phone = p.phone.trim();
      break;
    }
    case "customer": {
      if (
        !label(p.name) ||
        !label(p.id) ||
        typeof p.phone !== "string" ||
        p.phone.length > 25
      )
        throw Error("Enter valid customer details.");
      if (!s.customers.some((x) => x.id === p.id))
        s.customers.push({ id: p.id, name: p.name.trim(), phone: p.phone });
      break;
    }
    case "sale": {
      if (
        !["Cash", "MTN Mobile Money", "Airtel Money", "Credit"].includes(
          p.method,
        ) ||
        !Array.isArray(p.items) ||
        !p.items.length ||
        p.items.length > 200
      )
        throw Error("Choose products and a payment method.");
      if (
        p.method === "Credit" &&
        !s.customers.some((x) => x.id === p.customerId)
      )
        throw Error("Select a credit customer.");
      const seen = new Set();
      const items = p.items.map((i: any) => {
        const x = s.products.find((x) => x.id === i.productId && !x.archived);
        if (!x || !positive(i.quantity) || seen.has(i.productId))
          throw Error("Invalid product quantity.");
        seen.add(i.productId);
        if (x.quantity < i.quantity)
          throw Error("Insufficient stock for " + x.name + ".");
        if (i.price !== x.price)
          throw Error("Price changed for " + x.name + ". Review this sale.");
        x.quantity -= i.quantity;
        x.updatedAt = op.at;
        x.revision = op.id;
        return {
          productId: x.id,
          name: label(i.name) ? i.name.trim() : x.name,
          quantity: i.quantity,
          price: x.price,
        };
      });
      const total = items.reduce(
        (a: number, x: any) => a + x.price * x.quantity,
        0,
      );
      if (!positive(total) || (p.total !== undefined && p.total !== total))
        throw Error("Sale total must be greater than zero.");
      s.sales.push({
        id: op.id,
        at: op.at,
        items,
        total,
        method: p.method,
        customerId: p.method === "Credit" ? p.customerId : undefined,
      });
      break;
    }
    case "payment":
      if (
        !positive(p.amount) ||
        !s.customers.some((x) => x.id === p.customerId) ||
        p.amount > balance(s, p.customerId) ||
        !["Cash", "MTN Mobile Money", "Airtel Money"].includes(p.method)
      )
        throw Error("Payment must be within the outstanding balance.");
      s.payments.push({
        id: op.id,
        at: op.at,
        customerId: p.customerId,
        amount: p.amount,
        method: p.method,
      });
      break;
    case "resolve": {
      const x = s.reviews.find((x) => x.id === p.id);
      if (!x || !label(p.reason))
        throw Error("Select a review and enter a resolution reason.");
      if (x.resolved) throw Error("This conflict is already reviewed.");
      x.resolved = true;
      x.resolvedAt = op.at;
      x.resolution = p.reason.trim();
      x.history = [
        ...(x.history || []),
        { at: op.at, reason: p.reason.trim() },
      ];
      break;
    }
    default:
      throw Error("Unknown transaction.");
  }
  s.applied.push(op.id);
  return s;
}

// Conflicting operations remain immutable evidence and cannot later be silently replayed.
export function applyCloud(
  input: State,
  op: Operation,
  businessId?: string,
): State {
  if (input.reviews.some((r) => r.id === op?.id)) return input;
  try {
    if (
      op.type === "restore" &&
      businessId &&
      op.payload?.businessId !== businessId
    )
      throw Error("This backup belongs to another business.");
    return apply(input, op);
  } catch (e) {
    if (!op || !label(op.id)) throw e;
    const s = structuredClone(input);
    s.reviews.push({
      id: op.id,
      message: e instanceof Error ? e.message : "Invalid record",
      at: Date.now(),
      operation: structuredClone(op),
    });
    return s;
  }
}

export type SaleDraft = {
  items: { productId: string; quantity: number; price: number }[];
  method: string;
  customerId?: string;
};
// Capture human-readable receipt evidence before any other device can rename a product/customer.
export function snapshotSale(state: State, draft: SaleDraft) {
  const customer = state.customers.find((c) => c.id === draft.customerId);
  return {
    ...draft,
    items: draft.items.map((i) => ({
      ...i,
      name:
        state.products.find((p) => p.id === i.productId)?.name || i.productId,
    })),
    total: draft.items.reduce((n, i) => n + i.price * i.quantity, 0),
    customerSnapshot: customer ? { ...customer } : undefined,
  };
}
