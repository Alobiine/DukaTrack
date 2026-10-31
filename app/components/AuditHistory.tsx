import { useState } from "react";
import { stamp } from "../../lib/format";
type Event = {
  id: string;
  at: number;
  action: string;
  actor: string;
  payload: string;
};
export function AuditHistory() {
  const [events, setEvents] = useState<Event[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/audit", { cache: "no-store" });
      const d = (await r.json()) as { error?: string; events: Event[] };
      if (!r.ok) throw Error(d.error);
      setEvents(d.events);
      if (!d.events.length) setMessage("No synced audit events yet.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Connect online to view audit history.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="cardhead">
        <div>
          <h2>Owner audit history</h2>
          <p>
            Latest 100 synced actions. Original device time is included in each
            operation.
          </p>
        </div>
        <button className="secondary" onClick={load} disabled={busy}>
          {busy ? "Loading..." : "Load history online"}
        </button>
      </div>
      <div className="backupbody">
        <p role="status">{message}</p>
        {events.map((e) => (
          <details key={e.id}>
            <summary>
              {stamp(e.at)} - {e.actor} - {e.action}
            </summary>
            <pre>{JSON.stringify(JSON.parse(e.payload), null, 2)}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}
