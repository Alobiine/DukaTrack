import type { State } from "./domain";
import { stamp } from "./format";
function escape(value: unknown) {
  let text = String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function salesCsv(state: State) {
  return [
    "Receipt,Date,Payment,Customer,Original UGX,Returned UGX,Net UGX,Refund UGX",
    ...[...state.sales].reverse().map((sale) => {
      const corrections = (state.corrections || []).filter(
          (c) => c.saleId === sale.id,
        ),
        returned = corrections.reduce((n, c) => n + c.total, 0),
        refund = corrections.reduce((n, c) => n + c.refund, 0);
      return [
        sale.id,
        stamp(sale.at),
        sale.method,
        state.customers.find((c) => c.id === sale.customerId)?.name || "",
        sale.total,
        returned,
        sale.total - returned,
        refund,
      ]
        .map(escape)
        .join(",");
    }),
  ].join("\n");
}
