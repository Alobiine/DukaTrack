import {
  Package,
  Search,
  Users,
  ArrowDownLeft,
  ChevronRight,
  Download,
  ShoppingBag,
  Receipt,
  Store,
  LogOut,
  Cloud,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { Stat, Empty } from "../components/primitives";
import { money, stamp } from "../../lib/format";
import { balance, type State, type Product, type Sale } from "../../lib/domain";
import type { Bundle } from "../../lib/sync";
import type { Backup } from "../../lib/backup";
import { RestoreBackup } from "../components/RestoreBackup";
type Props = {
  products: Product[];
  low: Product[];
  search: string;
  setSearch: (v: string) => void;
  open: (name: string, obj?: unknown) => void;
};
export function StockScreen({ products, low, search, setSearch, open }: Props) {
  return (
    <>
      <div className="ministats">
        <span>
          <b>{products.length}</b> Active products
        </span>
        <span>
          <b>{low.length}</b> Low-stock products
        </span>
        <span>
          <b>{money(products.reduce((a, x) => a + x.price * x.quantity, 0))}</b>{" "}
          Stock at selling price
        </span>
      </div>
      <section className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted">{products.length} products</span>
        </div>
        {products.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Selling price</th>
                  <th>In stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter((p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="rowtitle">
                          <span className="productavatar">
                            {p.name.slice(0, 1)}
                          </span>
                          <b>{p.name}</b>
                        </span>
                      </td>
                      <td>{money(p.price)}</td>
                      <td className="bold">
                        {p.quantity}
                        <small className="block muted">
                          Minimum {p.threshold}
                        </small>
                      </td>
                      <td>
                        <span
                          className={
                            "pill " + (p.quantity <= p.threshold ? "amber" : "")
                          }
                        >
                          {p.quantity <= p.threshold ? "Low stock" : "In stock"}
                        </span>
                      </td>
                      <td>
                        <div className="rowactions">
                          <button onClick={() => open("adjust", p)}>
                            Adjust
                          </button>
                          <button onClick={() => open("product", p)}>
                            Edit
                          </button>
                          <button
                            className="dangertext"
                            onClick={() => open("archive", p)}
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Package}
            title="Your shelves start here"
            text="Add your first product, its selling price and current stock."
            action={() => open("product")}
            label="Add first product"
          />
        )}
      </section>
    </>
  );
}
