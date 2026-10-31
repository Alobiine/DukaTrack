import { useEffect, type MutableRefObject } from "react";
import { readLocal } from "../../lib/storage";
import type { Bundle } from "../../lib/sync";
export function useWorkspaceUpdates(
  id: string | undefined,
  busy: MutableRefObject<boolean>,
  update: (b: Bundle) => void,
) {
  useEffect(() => {
    if (!id) return;
    let live = true;
    const refresh = async () => {
      if (!busy.current) {
        try {
          const b = await readLocal<Bundle>(id);
          if (live && b) update(b);
        } catch {
          /* The next write reports persistent storage failure. */
        }
      }
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("dukatrack-updates")
        : null;
    if (channel)
      channel.onmessage = (e) => {
        if (e.data?.key === id) refresh();
      };
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      channel?.close();
      window.removeEventListener("focus", refresh);
    };
  }, [id, busy, update]);
}
