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
  Search,
} from "lucide-react";
import { Stat, Empty } from "../components/primitives";
import { Chart } from "../components/Chart";
import { SaleRows } from "../components/SaleRows";
import { money, stamp, day, nowDay } from "../../lib/format";
import { balance, type State, type Sale, type Product } from "../../lib/domain";
import type { Bundle } from "../../lib/sync";
type Props = {
  filter: string;
  setFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  filteredSales: Sale[];
  total: (v: Sale[]) => number;
  open: (name: string, obj?: unknown) => void;
  setCart: (v: Record<string, number>) => void;
  s: State;
};
export function SalesScreen({
  filter,
  setFilter,
  search,
  setSearch,
  filteredSales,
  total,
  open,
  setCart,
  s,
}: Props) {
  return (
    <section className="card">
      <div className="toolbar">
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
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Search receipt or product"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="listsummary">
        <b>{filteredSales.length} transactions</b>
        <span>{money(total(filteredSales))}</span>
      </div>
      <SaleRows
        rows={filteredSales}
        open={open}
        newSale={() => {
          setCart({});
          open("sale");
        }}
        corrections={s.corrections}
      />
    </section>
  );
}
