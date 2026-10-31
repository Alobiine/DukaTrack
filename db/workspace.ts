import { empty, type State, type Operation } from "../lib/domain";
import { validateState } from "../lib/backup";
type Business = { id: string; business: string };
export async function readWorkspace(
  db: D1Database,
  id: string,
): Promise<{ state: State; version: number }> {
  const business = await db
    .prepare("SELECT version FROM businesses WHERE id=?")
    .bind(id)
    .first<{ version: number }>();
  if (!business) {
    const legacy = await db
      .prepare("SELECT data FROM workspaces WHERE account_id=?")
      .bind(id)
      .first<{ data: string }>();
    if (!legacy) throw Error("Workspace not found");
    return { state: validateState(JSON.parse(legacy.data)), version: -1 };
  }
  const state = empty();
  for (const [table, key] of [
    ["products", "products"],
    ["customers", "customers"],
    ["sales", "sales"],
    ["repayments", "payments"],
    ["stock_movements", "adjustments"],
    ["corrections", "corrections"],
    ["conflict_reviews", "reviews"],
  ] as const) {
    const rows = await db
      .prepare(
        `SELECT payload FROM ${table} WHERE business_id=? ORDER BY rowid`,
      )
      .bind(id)
      .all<{ payload: string }>();
    // Only explicit stock adjustments belong in the legacy-compatible adjustment list.
    (state[key] as unknown[]) = (rows.results || [])
      .map((r) => JSON.parse(r.payload))
      .filter(
        (r) =>
          table !== "stock_movements" ||
          (r.kind !== "sale" && r.kind !== "correction"),
      );
  }
  const items = await db
    .prepare(
      "SELECT sale_id,product_id,quantity,price,name FROM sale_items WHERE business_id=? ORDER BY rowid",
    )
    .bind(id)
    .all<{
      sale_id: string;
      product_id: string;
      quantity: number;
      price: number;
      name: string;
    }>();
  for (const sale of state.sales)
    sale.items = items.results
      .filter((i) => i.sale_id === sale.id)
      .map((i) => ({
        productId: i.product_id,
        quantity: i.quantity,
        price: i.price,
        name: i.name,
      }));
  const applied = await db
    .prepare(
      "SELECT id FROM sync_operations WHERE business_id=? AND status='accepted' ORDER BY rowid",
    )
    .bind(id)
    .all<{ id: string }>();
  state.applied = applied.results.map((r) => r.id);
  return { state, version: business.version };
}
export async function commitWorkspace(
  db: D1Database,
  a: Business,
  state: State,
  version: number,
  operations: Operation[],
  previous: State = empty(),
): Promise<boolean> {
  if (version === -1) previous = empty();
  const changed = <T extends { id: string }>(
    rows: T[] | undefined,
    prior: T[] | undefined,
  ): T[] => {
    const existing = new Map(
      (prior || []).map((x) => [x.id, JSON.stringify(x)]),
    );
    return (rows || []).filter((x) => existing.get(x.id) !== JSON.stringify(x));
  };
  const token = crypto.randomUUID(),
    next = version + 1,
    id = a.id;
  const q = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args);
  // Unique token guards every write if the version compare-and-swap loses. D1 batch is atomic.
  const statements = [
    q(
      "INSERT OR IGNORE INTO businesses(id,name,version,write_token) VALUES(?,?,-1,?)",
      id,
      a.business,
      "",
    ),
    q(
      "UPDATE businesses SET version=?,write_token=? WHERE id=? AND version=?",
      next,
      token,
      id,
      version,
    ),
  ];
  const insert = (
    table: string,
    columns: string[],
    values: unknown[],
    update = false,
  ) => {
    const names = ["business_id", ...columns];
    statements.push(
      q(
        `INSERT INTO ${table}(${names.join(",")}) SELECT ${names.map(() => "?").join(",")} WHERE EXISTS(SELECT 1 FROM businesses WHERE id=? AND write_token=?) ON CONFLICT DO ${
          update
            ? "UPDATE SET " +
              columns
                .filter((c) => c !== "id")
                .map((c) => c + "=excluded." + c)
                .join(",")
            : "NOTHING"
        }`,
        id,
        ...values,
        id,
        token,
      ),
    );
  };
  insert("business_users", ["user_id", "role"], [id, "owner"]);
  for (const p of changed(state.products, previous.products))
    insert(
      "products",
      ["id", "name", "price", "quantity", "payload"],
      [p.id, p.name, p.price, p.quantity, JSON.stringify(p)],
      true,
    );
  for (const c of changed(state.customers, previous.customers))
    insert(
      "customers",
      ["id", "name", "payload"],
      [c.id, c.name, JSON.stringify(c)],
      true,
    );
  for (const s of changed(state.sales, previous.sales)) {
    insert(
      "sales",
      ["id", "at", "total", "customer_id", "method", "payload"],
      [s.id, s.at, s.total, s.customerId || null, s.method, JSON.stringify(s)],
    );
    for (const i of s.items)
      insert(
        "sale_items",
        ["sale_id", "product_id", "quantity", "price", "name"],
        [s.id, i.productId, i.quantity, i.price, i.name],
      );
  }
  for (const p of changed(state.payments, previous.payments))
    insert(
      "repayments",
      ["id", "customer_id", "amount", "at", "payload"],
      [p.id, p.customerId, p.amount, p.at, JSON.stringify(p)],
    );
  for (const x of changed(state.adjustments, previous.adjustments))
    insert(
      "stock_movements",
      ["id", "product_id", "delta", "at", "reason", "payload"],
      [x.id, x.productId || null, x.delta, x.at, x.reason, JSON.stringify(x)],
    );
  for (const sale of changed(state.sales, previous.sales))
    for (const i of sale.items) {
      const movement = {
        kind: "sale",
        saleId: sale.id,
        productId: i.productId,
      };
      insert(
        "stock_movements",
        ["id", "product_id", "delta", "at", "reason", "payload"],
        [
          "sale:" + sale.id + ":" + i.productId,
          i.productId,
          -i.quantity,
          sale.at,
          "Sale",
          JSON.stringify(movement),
        ],
      );
    }
  for (const c of changed(state.corrections, previous.corrections)) {
    insert(
      "corrections",
      ["id", "sale_id", "at", "total", "reason", "payload"],
      [c.id, c.saleId, c.at, c.total, c.reason, JSON.stringify(c)],
    );
    for (const i of c.items)
      insert(
        "stock_movements",
        ["id", "product_id", "delta", "at", "reason", "payload"],
        [
          "return:" + c.id + ":" + i.productId,
          i.productId,
          i.quantity,
          c.at,
          c.reason,
          JSON.stringify({ kind: "correction", correctionId: c.id }),
        ],
      );
  }
  const incoming = new Map(operations.map((o) => [o.id, o]));
  for (const opId of state.applied.filter((x) => !previous.applied.includes(x)))
    insert(
      "sync_operations",
      ["id", "status", "payload"],
      [
        opId,
        "accepted",
        incoming.has(opId) ? JSON.stringify(incoming.get(opId)) : null,
      ],
    );
  for (const r of changed(state.reviews, previous.reviews)) {
    insert(
      "conflict_reviews",
      ["id", "at", "resolved", "payload"],
      [r.id, r.at, r.resolved ? 1 : 0, JSON.stringify(r)],
      true,
    );
    insert(
      "sync_operations",
      ["id", "status", "payload"],
      [r.id, "rejected", r.operation ? JSON.stringify(r.operation) : null],
    );
  }
  for (const op of operations)
    insert(
      "audit_events",
      ["id", "actor_id", "at", "action", "payload"],
      [
        op.id,
        id,
        Date.now(),
        op.type,
        JSON.stringify({
          operation: op,
          outcome: state.reviews.some((r) => r.id === op.id)
            ? "rejected"
            : "accepted",
        }),
      ],
    );
  if (version === -1)
    insert(
      "audit_events",
      ["id", "actor_id", "at", "action", "payload"],
      [
        "migration",
        id,
        Date.now(),
        "legacy-migration",
        JSON.stringify({ source: "workspaces", legacyRetained: true }),
      ],
    );
  const results = await db.batch(statements);
  return !!results[1].meta.changes;
}
