import { useState, type FormEvent } from "react";
import { balance, type State, type Sale } from "../../lib/domain";
const money = (v: number) => "UGX " + v.toLocaleString("en-UG");
export function CorrectionForm({
  state,
  sale,
  save,
}: {
  state: State;
  sale: Sale;
  save: (type: string, payload: unknown) => Promise<boolean>;
}) {
  const [kind, setKind] = useState("reversal"),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false);
  const previous = (state.corrections || []).filter(
    (x) => x.saleId === sale.id,
  );
  const remaining = sale.items.map((i) => ({
    ...i,
    remaining:
      i.quantity -
      previous.reduce(
        (n, c) =>
          n + (c.items.find((x) => x.productId === i.productId)?.quantity || 0),
        0,
      ),
  }));
  const items = remaining
    .map((i) => ({
      productId: i.productId,
      quantity:
        kind === "reversal" ? i.remaining : quantities[i.productId] || 0,
    }))
    .filter((i) => i.quantity > 0);
  const total = items.reduce(
    (n, i) =>
      n +
      i.quantity * sale.items.find((x) => x.productId === i.productId)!.price,
    0,
  );
  const refund =
    sale.method === "Credit"
      ? Math.max(0, total - balance(state, sale.customerId!))
      : total;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await save("correction", {
        saleId: sale.id,
        kind,
        items,
        reason: f.get("reason"),
        refund,
        refundMethod: f.get("refundMethod") || sale.method,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <label className="field">
        Correction
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="reversal">Reverse remaining sale</option>
          <option value="return">Return selected items</option>
        </select>
      </label>
      {remaining.map((i) => (
        <label className="field" key={i.productId}>
          {i.name} - {i.remaining} remaining
          {kind === "return" && (
            <input
              aria-label={"Return quantity for " + i.name}
              type="number"
              min={0}
              max={i.remaining}
              step={1}
              value={quantities[i.productId] || 0}
              onChange={(e) =>
                setQuantities({
                  ...quantities,
                  [i.productId]: Number(e.target.value),
                })
              }
            />
          )}
        </label>
      ))}
      <p>
        Correction value: {money(total)}. Refund to give the customer:{" "}
        <b>{money(refund)}</b>
        {sale.method === "Credit"
          ? " (the rest reduces unpaid credit)."
          : ` via ${sale.method}.`}
      </p>
      <p>
        Confirm the actual refund before saving. DukaTrack records this refund;
        it does not transfer money. Returned units go back into stock. Record a
        separate stock adjustment if they are damaged.
      </p>
      {sale.method === "Credit" && (
        <label className="field">
          Refund method
          <select name="refundMethod">
            <option>Cash</option>
            <option>MTN Mobile Money</option>
            <option>Airtel Money</option>
          </select>
        </label>
      )}
      <label className="field">
        Reason
        <input name="reason" required maxLength={120} />
      </label>
      <label className="field">
        <span>
          <input type="checkbox" required /> I have checked the items and any
          refund.
        </span>
      </label>
      <button
        className="primary wide"
        disabled={
          busy ||
          !items.length ||
          items.some(
            (i) =>
              !Number.isInteger(i.quantity) ||
              i.quantity >
                remaining.find((x) => x.productId === i.productId)!.remaining,
          )
        }
      >
        Save correction
      </button>
    </form>
  );
}
