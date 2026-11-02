import { AuditHistory } from "../components/AuditHistory";
import {
  Download,
  Cloud,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { Empty } from "../components/primitives";
import { stamp } from "../../lib/format";
import { type State } from "../../lib/domain";
import type { Bundle } from "../../lib/sync";
import type { Backup } from "../../lib/backup";
import { RestoreBackup } from "../components/RestoreBackup";
type Props = {
  account: { id: string };
  bundle: Bundle;
  s: State;
  reviews: State["reviews"];
  online: boolean;
  syncing: boolean;
  error: string;
  sync: () => Promise<void>;
  backup: () => void;
  restoreBackup: (b: Backup) => Promise<boolean>;
  open: (name: string, obj?: unknown) => void;
};
export function SyncScreen({
  account,
  bundle,
  s,
  reviews,
  online,
  syncing,
  error,
  sync,
  backup,
  restoreBackup,
  open,
}: Props) {
  return (
    <>
      <div className="syncgrid">
        <section className="card syncpanel">
          <span className="cloudlarge">
            <Cloud size={36} />
          </span>
          <span className={"pill " + (!online ? "amber" : "")}>
            {online ? "Connected to the internet" : "Working offline"}
          </span>
          <h2>
            {syncing
              ? "Synchronising records..."
              : error
                ? "Sync needs attention"
              : !bundle.lastSync && !bundle.operations.length
                ? "First sync pending"
                : bundle.operations.length
                  ? `${bundle.operations.length} ${bundle.operations.length === 1 ? "record" : "records"} waiting`
                  : "Your workspace is up to date"}
          </h2>
          <p>
            {bundle.lastSync
              ? "Last successful sync: " + stamp(bundle.lastSync)
              : "Sync to save your business records to the cloud."}
          </p>
          <button
            className="primary"
            onClick={sync}
            disabled={syncing || !online}
          >
            <RefreshCw size={18} className={syncing ? "spin" : ""} />
            {syncing ? "Synchronising…" : "Sync now"}
          </button>
          <small>
            Sync uses your DukaTrack account. If your session expires, sign in
            online again.
          </small>
          {error.includes("Sign in") && (
            <button className="secondary" onClick={() => open("reauth")}>
              Sign in again
            </button>
          )}
        </section>
        <section className="card">
          <div className="cardhead">
            <div>
              <h2>Your backup, your copy</h2>
              <p>Export a portable copy of your records</p>
            </div>
            <Download size={22} />
          </div>
          <div className="backupbody">
            <p>
              Download your products, sales, customers, repayments and pending
              changes as a JSON file. Cloud sync is separate from this manual
              backup.
            </p>
            <button className="secondary" onClick={backup}>
              <Download size={17} />
              Download business backup
            </button>
            <RestoreBackup
              accountId={account.id}
              state={s}
              restore={restoreBackup}
            />
            <p className="muted">
              Keep exports private. Safety backups remain on this device; keep a
              separate downloaded copy.
            </p>
          </div>
        </section>
      </div>
      <section className="card">
        <div className="cardhead">
          <div>
            <h2>Needs review</h2>
            <p>Conflicting transactions are held for your decision</p>
          </div>
          <span className="count amber">{reviews.length}</span>
        </div>
        {reviews.length ? (
          <div className="reviewlist">
            {reviews.map((r) => (
              <div key={r.id}>
                <AlertTriangle size={20} />
                <div>
                  <b>{r.message}</b>
                  <small>
                    {stamp(r.at)} · {r.id.slice(0, 8)}
                  </small>
                  <p>
                    This operation is retained for reconciliation and has not
                    changed cloud stock or balances. Inspect its full details,
                    correct the business records if needed, then record your
                    decision.
                  </p>
                  <details>
                    <summary>Original operation</summary>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {JSON.stringify(
                        r.operation ||
                          bundle.rejected.find((x) => x.id === r.id)?.operation,
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </div>
                <button
                  className="secondary"
                  onClick={() => open("resolve", r)}
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={ShieldCheck}
            title="Nothing needs review"
            text="When a stock or record conflict is found, it will appear here."
          />
        )}
      </section>
      <section className="card">
        <div className="cardhead">
          <h2>Resolution history</h2>
        </div>
        {s.reviews
          .filter((r) => r.resolved)
          .map((r) => (
            <div className="backupbody" key={r.id}>
              <b>{r.message}</b>
              <p>{r.resolution || "Reviewed in an earlier version"}</p>
              <small>
                {stamp(r.resolvedAt || r.at)} - {r.id}
              </small>
              <details>
                <summary>Original operation and decisions</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(
                    { operation: r.operation, history: r.history },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          ))}
      </section>
      <AuditHistory />
    </>
  );
}
