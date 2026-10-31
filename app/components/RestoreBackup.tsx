import { useState } from "react";
import { parseBackup, mergeBackup, type Backup } from "../../lib/backup";
import type { State } from "../../lib/domain";
export function RestoreBackup({
  accountId,
  state,
  restore,
}: {
  accountId: string;
  state: State;
  restore: (b: Backup) => Promise<boolean>;
}) {
  const [backup, setBackup] = useState<Backup | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div>
      <label className="field">
        Restore DukaTrack JSON backup
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            setBackup(null);
            setError("");
            try {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 400000)
                throw Error("Supported import limit is 400 KB.");
              const b = parseBackup(await file.text(), accountId);
              mergeBackup(state, b.state);
              setBackup(b);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Invalid backup.");
            }
          }}
        />
      </label>
      {backup && (
        <>
          <p>
            Backup: {backup.business.business}. {backup.state.products.length}{" "}
            products, {backup.state.sales.length} sales,{" "}
            {backup.state.payments.length} repayments.
          </p>
          <p>
            Identical records are skipped. New records are added. Any
            conflicting record blocks the entire restore. Existing records will
            not be overwritten. A safety backup will be stored on this device
            and downloaded before import.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (await restore(backup)) setBackup(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Restoring..." : "Create safety backup and restore"}
          </button>
        </>
      )}
      <p role="alert">{error}</p>
    </div>
  );
}
