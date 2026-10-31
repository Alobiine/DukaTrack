import { Receipt, ChevronRight, ShoppingBag } from "lucide-react";
import { Empty } from "./primitives";
import { money, stamp, day } from "../../lib/format";
import type { Sale, Correction } from "../../lib/domain";
export function SaleRows({
  rows,
  open,
  newSale,
  corrections = [],
}: {
  rows: Sale[];
  open: (name: string, obj?: unknown) => void;
  newSale: () => void;
  corrections?: Correction[];
}) {
  return rows.length ? (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Date & time</th>
            <th>Payment</th>
            <th className="right">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr
              key={x.id}
              onClick={() => open("receipt", x)}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && open("receipt", x)}
            >
              <td>
                <span className="rowtitle">
                  <span className="miniicon">
                    <Receipt size={17} />
                  </span>
                  <span>
                    #{x.id.slice(0, 8).toUpperCase()}
                    <small>{x.items.map((i) => i.name).join(", ")}</small>
                  </span>
                </span>
              </td>
              <td>{stamp(x.at)}</td>
              <td>
                <span
                  className={"pill " + (x.method === "Credit" ? "amber" : "")}
                >
                  {x.method}
                </span>
              </td>
              <td className="right bold">
                {money(
                  x.total -
                    corrections
                      .filter((c) => c.saleId === x.id)
                      .reduce((n, c) => n + c.total, 0),
                )}
                {corrections.some((c) => c.saleId === x.id) && (
                  <small className="block muted">
                    Original {money(x.total)}
                  </small>
                )}
              </td>
              <td>
                <ChevronRight size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      icon={ShoppingBag}
      title="Your next sale starts here"
      text="Record a sale to see your transaction history."
      action={newSale}
      label="Record a sale"
    />
  );
}
