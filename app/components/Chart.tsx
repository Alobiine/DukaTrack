import { money, day } from "../../lib/format";
import type { Sale } from "../../lib/domain";
export function Chart({
  sales,
  total,
}: {
  sales: Sale[];
  total: (v: Sale[]) => number;
}) {
  const days = Array.from(
    { length: 7 },
    (_, i) => Date.now() - (6 - i) * 86400000,
  );
  const values = days.map((d) =>
      total(sales.filter((x) => day(x.at) === day(d))),
    ),
    max = Math.max(...values, 10000);
  return (
    <div className="chart">
      <div className="chartgrid">
        <span>{money(max)}</span>
        <span>{money(max / 2)}</span>
        <span>UGX 0</span>
      </div>
      <div className="bars">
        {days.map((d, i) => (
          <div className="barcol" key={i}>
            <div className="bararea" title={money(values[i])}>
              <div
                className={"bar " + (i === 6 ? "active" : "")}
                style={{
                  height: values[i]
                    ? Math.max(3, (values[i] / max) * 100) + "%"
                    : "2px",
                }}
              />
            </div>
            <label>
              {new Date(d).toLocaleDateString("en", {
                weekday: "short",
                timeZone: "Africa/Kampala",
              })}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
