import type { State } from "./domain";
import { day } from "./format";

export function inSalesPeriod(at: number, period: string, now = Date.now()) {
  if (period === "All") return true;
  const today = day(now), sold = day(at);
  if (period === "Today") return sold === today;
  // Calendar week starts Monday, using the business timezone rather than device timezone.
  const start = new Date(today + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  return sold >= start.toISOString().slice(0, 10) && sold <= today;
}

export function creditHistory(state: State, customerId: string) {
  return [
    ...state.sales.filter((sale) => sale.customerId === customerId && sale.method === "Credit").map((sale) => ({
      id: sale.id, at: sale.at, label: "Credit sale", amount: sale.total, detail: "",
    })),
    ...state.payments.filter((payment) => payment.customerId === customerId).map((payment) => ({
      id: payment.id, at: payment.at, label: "Payment · " + payment.method, amount: -payment.amount, detail: "",
    })),
    ...(state.corrections || []).filter((correction) => correction.customerId === customerId).map((correction) => ({
      id: correction.id, at: correction.at,
      label: correction.kind === "reversal" ? "Credit sale reversed" : "Credit sale return",
      amount: correction.refund - correction.creditReduction,
      detail: correction.reason + (correction.refund ? ` · Refund UGX ${correction.refund.toLocaleString("en-UG")} (${correction.refundMethod || "Cash"})` : ""),
    })),
  ].sort((a, b) => b.at - a.at);
}
