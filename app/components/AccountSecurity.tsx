import { useState, type FormEvent } from "react";
export function AccountSecurity({
  mode,
  onComplete,
}: {
  mode: "change" | "recover";
  onComplete?: () => void;
}) {
  const [message, setMessage] = useState(""),
    [action, setAction] = useState("request"),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      action = String(f.get("action") || "change-password");
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(mode === "change" ? "/api/auth" : "/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(f), action }),
      });
      const d = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw Error(d.error || "Request failed.");
      setMessage(
        d.message || "Password updated. Sign in with your new password.",
      );
      if (action !== "request") onComplete?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Service unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {mode === "change" ? (
        <>
          <label className="field">
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <input type="hidden" name="action" value="change-password" />
        </>
      ) : (
        <>
          <label className="field">
            Action
            <select name="action" value={action} onChange={(e) => { setAction(e.target.value); setMessage(""); }}>
              <option value="request">Send recovery email</option>
              <option value="reset">Reset with emailed token</option>
            </select>
          </label>
          {action === "request" ? (
            <label className="field">
              Registered email address
              <input name="email" type="email" autoComplete="email" maxLength={254} required />
            </label>
          ) : (
            <label className="field">
              Recovery token from your email
              <input name="token" autoComplete="off" minLength={64} maxLength={64} required />
            </label>
          )}
        </>
      )}
      {(mode === "change" || action === "reset") && <label className="field">
        New password{mode === "recover" ? " (for reset)" : ""}
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </label>}
      <button className="primary wide" disabled={busy}>
        {busy
          ? "Please wait..."
          : mode === "change"
            ? "Change password and revoke sessions"
            : action === "request" ? "Send recovery email" : "Reset password"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
