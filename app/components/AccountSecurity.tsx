import { useState, type FormEvent } from "react";
export function AccountSecurity({
  mode,
  onComplete,
}: {
  mode: "change" | "recover";
  onComplete?: () => void;
}) {
  const [message, setMessage] = useState(""),
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
            <select name="action">
              <option value="request">Send recovery token</option>
              <option value="reset">Reset with received token</option>
            </select>
          </label>
          <label className="field">
            Registered phone
            <input name="phone" type="tel" />
          </label>
          <label className="field">
            Recovery token (for reset)
            <input name="token" autoComplete="off" maxLength={64} />
          </label>
        </>
      )}
      <label className="field">
        New password{mode === "recover" ? " (for reset)" : ""}
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required={mode === "change"}
        />
      </label>
      <button className="primary wide" disabled={busy}>
        {busy
          ? "Please wait..."
          : mode === "change"
            ? "Change password and revoke sessions"
            : "Continue recovery"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
