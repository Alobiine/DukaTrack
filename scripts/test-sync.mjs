import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))(
  "esbuild",
);
const r = await build({
  entryPoints: ["lib/sync.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { synchronise, blank } = await import(
  "data:text/javascript;base64," +
    Buffer.from(r.outputFiles[0].text).toString("base64")
);
const initial = blank();
initial.operations = Array.from({ length: 205 }, (_, i) => ({
  id: "c" + i,
  type: "customer",
  at: 1,
  payload: { id: "c" + i, name: "Customer " + i, phone: "" },
}));
let saved = structuredClone(initial),
  batches = [];
const send = async (ops) => {
  batches.push(ops.length);
  return {
    state: blank().state,
    accepted: ops.map((o) => o.id),
    rejected: [],
    syncedAt: 1,
  };
};
await synchronise(initial, send, async (b) => {
  saved = structuredClone(b);
});
assert.deepEqual(batches, [100, 100, 5]);
assert.equal(saved.operations.length, 0);
saved = structuredClone(initial);
let count = 0;
await assert.rejects(
  synchronise(
    initial,
    async (ops) => {
      if (++count === 2) throw Error("Connection lost");
      return send(ops);
    },
    async (b) => {
      saved = structuredClone(b);
    },
  ),
);
assert.equal(saved.operations.length, 105);
await synchronise(saved, send, async (b) => {
  saved = b;
});
assert.equal(saved.operations.length, 0);
await assert.rejects(
  synchronise(initial, send, async () => {
    throw Error("Disk full");
  }),
);
assert.equal(initial.operations.length, 205);
await assert.rejects(
  synchronise(
    initial,
    async () => ({
      state: blank().state,
      accepted: [],
      rejected: [],
      syncedAt: 1,
    }),
    async () => assert.fail(),
  ),
);
console.log(
  "PASS: all sync batches, interrupted sync/resume, failed local commit, incomplete acknowledgement.",
);

const conflict = blank();
conflict.operations = [
  ...initial.operations.slice(0, 100),
  {
    id: "offline-sale",
    type: "sale",
    at: 1,
    payload: {
      items: [{ productId: "gone", quantity: 1, price: 10 }],
      method: "Cash",
    },
  },
];
const checkpoints = [];
await synchronise(
  conflict,
  async (ops) => ({
    state: blank().state,
    accepted: ops.filter((o) => o.id !== "offline-sale").map((o) => o.id),
    rejected: ops
      .filter((o) => o.id === "offline-sale")
      .map((o) => ({ id: o.id, message: "Product missing", operation: o })),
    syncedAt: 1,
  }),
  async (b) => {
    checkpoints.push(structuredClone(b));
  },
);
assert.equal(checkpoints[0].operations.length, 1);
assert.equal(checkpoints[0].operations[0].id, "offline-sale");
assert.equal(
  checkpoints[0].state.reviews[0].operation.payload.items[0].productId,
  "gone",
);
assert.equal(checkpoints[1].rejected[0].operation.id, "offline-sale");
console.log(
  "PASS: optimistic replay conflicts retain unsent operations and complete rejection evidence.",
);
