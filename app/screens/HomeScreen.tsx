import {
  ShoppingBag,
  Wallet,
  Smartphone,
  Users,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  Cloud,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Stat, Empty } from "../components/primitives";
import { Chart } from "../components/Chart";
import { SaleRows } from "../components/SaleRows";
import { money, stamp, day, nowDay } from "../../lib/format";
import { balance, type State, type Sale, type Product } from "../../lib/domain";
import type { Bundle } from "../../lib/sync";
type Props = {
  s: State;
  todaySales: Sale[];
  todayTotal: number;
  total: (v: Sale[]) => number;
  credit: number;
  bundle: Bundle;
  setCart: (v: Record<string, number>) => void;
  open: (name: string, obj?: unknown) => void;
  sync: () => Promise<void>;
  syncing: boolean;
  online: boolean;
  syncError: string;
  go: (name: string) => void;
  sales: Sale[];
  low: Product[];
  products: Product[];
};
export function HomeScreen({
  s,
  todaySales,
  todayTotal,
  total,
  credit,
  bundle,
  setCart,
  open,
  sync,
  syncing,
  online,
  syncError,
  go,
  sales,
  low,
  products,
}: Props) {
  return (
    <>
      <div className="stats">
        <Stat
          label="Today’s sales"
          value={money(todayTotal)}
          icon={ShoppingBag}
          foot={`${todaySales.length} transactions today`}
          green
        />
        <Stat
          label="Cash received"
          value={money(
            todaySales
              .filter((x) => x.method === "Cash")
              .reduce((a, x) => a + x.total, 0) +
              s.payments
                .filter((x) => day(x.at) === nowDay() && x.method === "Cash")
                .reduce((a, x) => a + x.amount, 0) -
              (s.corrections || [])
                .filter(
                  (c) =>
                    day(c.at) === nowDay() &&
                    (c.refundMethod || "Cash") === "Cash",
                )
                .reduce((n, c) => n + c.refund, 0),
          )}
          icon={Wallet}
          foot="Receipts less refunds today"
        />
        <Stat
          label="Mobile money received"
          value={money(
            todaySales
              .filter((x) => x.method.includes("Money"))
              .reduce((a, x) => a + x.total, 0) +
              s.payments
                .filter(
                  (x) => day(x.at) === nowDay() && x.method.includes("Money"),
                )
                .reduce((a, x) => a + x.amount, 0) -
              (s.corrections || [])
                .filter(
                  (c) =>
                    day(c.at) === nowDay() && c.refundMethod?.includes("Money"),
                )
                .reduce((n, c) => n + c.refund, 0),
          )}
          icon={Smartphone}
          foot="MTN & Airtel · recorded payments"
        />
        <Stat
          label="Customer credit"
          value={money(credit)}
          icon={Users}
          foot={`${s.customers.filter((c) => balance(s, c.id) > 0).length} customers with a balance`}
        />
      </div>
      <div className="overviewgrid">
        <section className="card">
          <div className="cardhead">
            <div>
              <h2>Sales performance</h2>
              <p>Your daily sales over the last 7 days</p>
            </div>
            <span className="pill neutral">Last 7 days</span>
          </div>
          <div className="chartsummary">
            {money(
              total(s.sales.filter((x) => x.at > Date.now() - 7 * 86400000)),
            )}
            <small>Total sales</small>
          </div>
          <Chart sales={s.sales} total={total} />
        </section>
        <section className="card quickcard">
          <div className="cardhead">
            <div>
              <h2>Keep business moving</h2>
              <p>The things you do every day</p>
            </div>
          </div>
          <button
            className="quick"
            onClick={() => {
              setCart({});
              open("sale");
            }}
          >
            <span className="quickicon green">
              <ShoppingBag size={20} />
            </span>
            <span>
              Record a sale<small>Sell products & update stock</small>
            </span>
            <ArrowUpRight size={18} />
          </button>
          <button className="quick" onClick={() => open("product")}>
            <span className="quickicon blue">
              <Package size={20} />
            </span>
            <span>
              Add a product<small>Bring something new to your shelves</small>
            </span>
            <ArrowUpRight size={18} />
          </button>
          <button className="quick" onClick={() => open("payment")}>
            <span className="quickicon amber">
              <ArrowDownLeft size={20} />
            </span>
            <span>
              Record a payment<small>Reduce a customer’s credit balance</small>
            </span>
            <ArrowUpRight size={18} />
          </button>
          <div className="synchint">
            <Cloud size={21} />
            <div>
              <b>
                {syncError ? "Sync needs attention" : bundle.operations.length
                  ? `${bundle.operations.length} records ready to sync`
                  : "Your records, in step"}{" "}
              </b>
              <small>
                {bundle.lastSync
                  ? "Last synced " + stamp(bundle.lastSync)
                  : "Connect and sync to back up your records"}
              </small>
            </div>
            <button
              aria-label="Synchronise"
              onClick={sync}
              disabled={syncing || !online}
            >
              <RefreshCw size={18} className={syncing ? "spin" : ""} />
            </button>
          </div>
        </section>
      </div>
      <div className="bottomgrid">
        <section className="card">
          <div className="cardhead">
            <div>
              <h2>Recent transactions</h2>
              <p>Your latest business activity</p>
            </div>
            <button className="textbutton" onClick={() => go("Sales")}>
              View all
              <ArrowUpRight size={15} />
            </button>
          </div>
          <SaleRows
            rows={sales.slice(0, 5)}
            open={open}
            newSale={() => {
              setCart({});
              open("sale");
            }}
            corrections={s.corrections}
          />
        </section>
        <section className="card">
          <div className="cardhead">
            <div>
              <h2>Stock watch</h2>
              <p>Products that need attention</p>
            </div>
            <span className="count amber">{low.length}</span>
          </div>
          {low.length ? (
            <div className="stockwatch">
              {low.slice(0, 4).map((p) => (
                <button key={p.id} onClick={() => open("adjust", p)}>
                  <span className="productavatar">{p.name.slice(0, 1)}</span>
                  <span>
                    {p.name}
                    <small>
                      {p.quantity} remaining · minimum {p.threshold}
                    </small>
                  </span>
                  <span className="pill amber">
                    {p.quantity === 0 ? "Out of stock" : "Low stock"}
                  </span>
                </button>
              ))}
              <button className="textbutton" onClick={() => go("Stock")}>
                Manage stock
                <ChevronRight size={15} />
              </button>
            </div>
          ) : (
            <Empty
              icon={Package}
              title={
                products.length ? "Stock looks healthy" : "Stock your workspace"
              }
              text={
                products.length
                  ? "No products below their stock threshold."
                  : "Add products to start tracking your inventory."
              }
              action={() => open("product")}
              label="Add product"
            />
          )}
        </section>
      </div>
    </>
  );
}
