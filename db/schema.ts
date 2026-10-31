import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  primaryKey,
  foreignKey,
  index,
  check,
} from "drizzle-orm/sqlite-core";
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  owner: text("owner").notNull(),
  business: text("business").notNull(),
  password: text("password").notNull(),
  salt: text("salt").notNull(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: integer("locked_until").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  expires: integer("expires").notNull(),
});
export const workspaces = sqliteTable("workspaces", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  version: integer("version").notNull().default(0),
  data: text("data").notNull(),
});

// Legacy workspaces remain read-only after lazy migration; never drop them.
export const recoveryTokens = sqliteTable(
  "recovery_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    expires: integer("expires").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("recovery_account").on(t.accountId, t.createdAt)],
);
export const recoveryLimits = sqliteTable("recovery_limits", {
  subject: text("subject").primaryKey(),
  requestedAt: integer("requested_at").notNull(),
});
export const businesses = sqliteTable("businesses", {
  id: text("id")
    .primaryKey()
    .references(() => accounts.id),
  name: text("name").notNull(),
  version: integer("version").notNull().default(0),
  writeToken: text("write_token").notNull(),
});
export const businessUsers = sqliteTable(
  "business_users",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: text("user_id")
      .notNull()
      .references(() => accounts.id),
    role: text("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.userId] }),
    check("owner_role", sql`${t.role}='owner'`),
  ],
);
export const products = sqliteTable(
  "products",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    quantity: integer("quantity").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.id] }),
    check("product_price", sql`${t.price}>=0`),
    check("product_quantity", sql`${t.quantity}>=0`),
  ],
);
export const customers = sqliteTable(
  "customers",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    name: text("name").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.id] })],
);
export const sales = sqliteTable(
  "sales",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    at: integer("at").notNull(),
    total: integer("total").notNull(),
    customerId: text("customer_id"),
    method: text("method").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.id] }),
    foreignKey({
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }),
    index("sales_business_date").on(t.businessId, t.at),
    check("sale_total", sql`${t.total}>0`),
  ],
);
export const saleItems = sqliteTable(
  "sale_items",
  {
    businessId: text("business_id").notNull(),
    saleId: text("sale_id").notNull(),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    price: integer("price").notNull(),
    name: text("name").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.saleId, t.productId] }),
    foreignKey({
      columns: [t.businessId, t.saleId],
      foreignColumns: [sales.businessId, sales.id],
    }),
    foreignKey({
      columns: [t.businessId, t.productId],
      foreignColumns: [products.businessId, products.id],
    }),
    check("item_quantity", sql`${t.quantity}>0`),
    check("item_price", sql`${t.price}>=0`),
  ],
);
export const repayments = sqliteTable(
  "repayments",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    customerId: text("customer_id").notNull(),
    amount: integer("amount").notNull(),
    at: integer("at").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.id] }),
    foreignKey({
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }),
    index("repayments_customer").on(t.businessId, t.customerId, t.at),
    check("repayment_amount", sql`${t.amount}>0`),
  ],
);
export const stockMovements = sqliteTable(
  "stock_movements",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    productId: text("product_id"),
    delta: integer("delta").notNull(),
    at: integer("at").notNull(),
    reason: text("reason").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.id] }),
    foreignKey({
      columns: [t.businessId, t.productId],
      foreignColumns: [products.businessId, products.id],
    }),
    check("movement_nonzero", sql`${t.delta}<>0`),
  ],
);
export const corrections = sqliteTable(
  "corrections",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    saleId: text("sale_id").notNull(),
    at: integer("at").notNull(),
    total: integer("total").notNull(),
    reason: text("reason").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.id] }),
    foreignKey({
      columns: [t.businessId, t.saleId],
      foreignColumns: [sales.businessId, sales.id],
    }),
    check("correction_total", sql`${t.total}>=0`),
  ],
);
export const syncOperations = sqliteTable(
  "sync_operations",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    status: text("status").notNull(),
    payload: text("payload"),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.id] }),
    check("operation_status", sql`${t.status} IN ('accepted','rejected')`),
  ],
);
export const conflictReviews = sqliteTable(
  "conflict_reviews",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    at: integer("at").notNull(),
    resolved: integer("resolved").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.id] }),
    check("review_resolved", sql`${t.resolved} IN (0,1)`),
  ],
);
export const auditEvents = sqliteTable(
  "audit_events",
  {
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id),
    id: text("id").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => accounts.id),
    at: integer("at").notNull(),
    action: text("action").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.id] }),
    index("audit_business_date").on(t.businessId, t.at),
  ],
);

export const securityEvents = sqliteTable(
  "security_events",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    action: text("action").notNull(),
    at: integer("at").notNull(),
  },
  (t) => [index("security_account_date").on(t.accountId, t.at)],
);
