import { Package, Users, Download, ShoppingBag, Receipt } from "lucide-react";
import { Stat } from "../components/primitives";
import { money } from "../../lib/format";
import { balance, type State, type Product, type Sale } from "../../lib/domain";

type Props = {
  s: State;
  products: Product[];
  low: Product[];
  credit: number;
  filter: string;
  setFilter: (v: string) => void;
  filteredSales: Sale[];
  total: (v: Sale[]) => number;
  exportSales: () => void;
};
export function ReportsScreen({
  s,
  products,
  low,
  credit,
  filter,
  setFilter,
  filteredSales,
  total,
  exportSales,
}: Props) {
  return (
    <>
      <div className="toolbar reporttoolbar">
        <div className="segmented">
          {["Today", "This week", "All"].map((f) => (
            <button
              className={filter === f ? "active" : ""}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={exportSales}>
          <Download size={17} />
          Export all sales CSV
        </button>
      </div>
      <div className="stats">
        <Stat
          label="Sales revenue"
          value={money(total(filteredSales))}
          icon={ShoppingBag}
          foot={`${filteredSales.length} recorded sales`}
          green
        />
        <Stat
          label="Average sale"
          value={money(
            filteredSales.length
              ? total(filteredSales) / filteredSales.length
              : 0,
          )}
          icon={Receipt}
          foot="Revenue divided by transactions"
        />
        <Stat
          label="Outstanding credit"
          value={money(credit)}
          icon={Users}
          foot="Current balance · all time"
        />
        <Stat
          label="Low-stock products"
          value={String(low.length)}
          icon={Package}
          foot={`${products.length} active products`}
        />
      </div>
      <div className="overviewgrid">
        <section className="card">
          <div className="cardhead">
            <div>
              <h2>Payment breakdown</h2>
              <p>Sales only · {filter.toLowerCase()}</p>
            </div>
          </div>
          <div className="paymentreport">
            {["Cash", "MTN Mobile Money", "Airtel Money", "Credit"].map((m) => {
              const v = total(filteredSales.filter((x) => x.method === m));
              return (
                <div key={m}>
                  <div>
                    <span>{m}</span>
                    <b>{money(v)}</b>
                  </div>
                  <div className="track">
                    <i
                      style={{
                        width:
                          (total(filteredSales)
                            ? (v / total(filteredSales)) * 100
                            : 0) + "%",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="reportnote">
            Mobile-money amounts are manually recorded. This app does not
            process payments. Revenue is not profit.
          </p>
        </section>
        <section className="card">
          <div className="cardhead">
            <div>
              <h2>Credit balances</h2>
              <p>Current outstanding amounts</p>
            </div>
          </div>
          <div className="reportlist">
            {s.customers.length ? (
              s.customers.map((c) => (
                <div key={c.id}>
                  <span>{c.name}</span>
                  <b>{money(balance(s, c.id))}</b>
                </div>
              ))
            ) : (
              <p>No customers yet.</p>
            )}
          </div>
        </section>
      </div>
      <section className="card">
        <div className="cardhead">
          <div>
            <h2>Stock levels</h2>
            <p>Current quantities and selling value</p>
          </div>
        </div>
        <div className="reportlist">
          {products.length ? (
            products.map((p) => (
              <div key={p.id}>
                <span>
                  {p.name}
                  <small>{p.quantity} units remaining</small>
                </span>
                <b>{money(p.quantity * p.price)}</b>
              </div>
            ))
          ) : (
            <p>No products yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
