import { applyCloud, empty, type State, type Operation } from "./domain";
export type Rejected = { id: string; message: string; operation?: Operation };
export type Bundle = {
  state: State;
  operations: Operation[];
  lastSync: number;
  rejected: Rejected[];
};
export const blank = (): Bundle => ({
  state: empty(),
  operations: [],
  lastSync: 0,
  rejected: [],
});
export type Reply = {
  state: State;
  accepted: string[];
  rejected: Rejected[];
  syncedAt: number;
};
// Caller holds the workspace lock. Persist each acknowledgement before sending more.
export async function synchronise(
  initial: Bundle,
  send: (ops: Operation[]) => Promise<Reply>,
  save: (b: Bundle) => Promise<void>,
): Promise<Bundle> {
  let b = initial;
  do {
    const sent: Operation[] = [];
    let bytes = 32;
    for (const op of b.operations.slice(0, 100)) {
      const size = new TextEncoder().encode(JSON.stringify(op)).length + 1;
      if (size > 450000)
        throw Error(
          "A pending operation exceeds the 450 KB sync limit. Export a backup and contact support.",
        );
      if (bytes + size > 450000) break;
      sent.push(op);
      bytes += size;
    }
    const d = await send(sent);
    if (
      !d.state ||
      !Array.isArray(d.accepted) ||
      !Array.isArray(d.rejected) ||
      !Number.isFinite(d.syncedAt)
    )
      throw Error("Invalid sync response. Pending records are retained.");
    const ack = new Set([...d.accepted, ...d.rejected.map((x) => x.id)]);
    if (sent.some((o) => !ack.has(o.id)))
      throw Error(
        "Incomplete sync acknowledgement. Pending records are retained.",
      );
    const rest = b.operations.slice(sent.length);
    let state = d.state;
    // Keep every unsent operation in the queue, even if optimistic replay conflicts.
    for (const op of rest) state = applyCloud(state, op);
    const rejected = new Map(b.rejected.map((x) => [x.id, x]));
    for (const x of d.rejected)
      rejected.set(x.id, {
        ...x,
        operation: x.operation || sent.find((o) => o.id === x.id),
      });
    const next = {
      state,
      operations: rest,
      lastSync: d.syncedAt,
      rejected: [...rejected.values()],
    };
    await save(next);
    b = next;
  } while (b.operations.length);
  return b;
}
