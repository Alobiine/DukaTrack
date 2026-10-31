import { Search } from "lucide-react";

import { SaleRows } from "../components/SaleRows";
import { money } from "../../lib/format";
import { type State, type Sale } from "../../lib/domain";

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
