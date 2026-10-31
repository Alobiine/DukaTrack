import { Search, Users, ArrowDownLeft, ChevronRight } from "lucide-react";
import { Empty } from "../components/primitives";
import { money } from "../../lib/format";
import { balance, type State } from "../../lib/domain";

type Props = {
  s: State;
  credit: number;
  search: string;
  setSearch: (v: string) => void;
  open: (name: string, obj?: unknown) => void;
};
export function CreditScreen({ s, credit, search, setSearch, open }: Props) {
  return (
    <>
      <div className="ministats">
        <span>
          <b>{money(credit)}</b>Total outstanding
        </span>
        <span>
          <b>{s.customers.length}</b>Customers
        </span>
        <button className="secondary" onClick={() => open("payment")}>
          <ArrowDownLeft size={17} />
          Record payment
        </button>
      </div>
      <section className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {s.customers.length ? (
          <div className="customergrid">
            {s.customers
              .filter(
                (c) =>
                  c.name.toLowerCase().includes(search.toLowerCase()) ||
                  c.phone.includes(search),
              )
              .map((c) => (
                <button
                  className="customercard"
                  key={c.id}
                  onClick={() => open("customer-detail", c)}
                >
                  <span className="avatar pale">{c.name.slice(0, 1)}</span>
                  <span>
                    <b>{c.name}</b>
                    <small>{c.phone || "No phone number"}</small>
                  </span>
                  <ChevronRight size={17} />
                  <div className="customerbalance">
                    <small>Outstanding balance</small>
                    <strong>{money(balance(s, c.id))}</strong>
                  </div>
                </button>
              ))}
          </div>
        ) : (
          <Empty
            icon={Users}
            title="Keep customer credit clear"
            text="Add customers to record credit sales and track repayments."
            action={() => open("customer")}
            label="Add customer"
          />
        )}
      </section>
    </>
  );
}
