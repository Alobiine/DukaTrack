"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Field } from "./primitives";
import { PasswordField } from "./PasswordField";

export function PasswordRecoveryForm({ step }: { step: "request" | "reset" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [linkToken, setLinkToken] = useState("");

  useEffect(() => {
    if (step !== "reset") return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      setLinkToken(token);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [step]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const form = new FormData(event.currentTarget);
    if (step === "reset" && form.get("newPassword") !== form.get("confirmPassword")) {
      setError("Your passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(step === "request"
          ? { action: "request", email: form.get("email") }
          : { action: "reset", token: linkToken || String(form.get("token") || "").trim(), newPassword: form.get("newPassword") }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(response.status === 503
        ? "Password reset is temporarily unavailable. Please try again later."
        : result.error || "We could not process your request. Please try again.");
      setComplete(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (complete) return (
    <div className="recovery-result" role="status">
      <h2>{step === "request" ? "Check your inbox" : "Password updated"}</h2>
      <p>{step === "request"
        ? "If an account matches that email, we’ve sent password reset instructions. Check your spam folder too."
        : "You can now sign in with your new password."}</p>
      {step === "request" && <a href="/reset-password">Enter your reset code</a>}
    </div>
  );

  return (
    <form onSubmit={submit}>
      <fieldset className="recovery-fields" disabled={busy}>
        {step === "request" ? (
          <Field label="Email address" name="email" type="email" autoComplete="email" maxLength={254} required />
        ) : (
          <>
            {!linkToken && <Field label="Reset code" name="token" autoComplete="off" minLength={64} maxLength={64} pattern="[a-f0-9]{64}" title="Enter the 64-character code from your password reset email." required />}
            <PasswordField label="New password" name="newPassword" autoComplete="new-password" minLength={8} maxLength={128} required />
            <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" minLength={8} maxLength={128} required />
            <p className="recovery-hint">Use at least 8 characters.</p>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary wide" type="submit">
          {busy ? "Please wait…" : step === "request" ? "Send reset instructions" : "Reset password"}
        </button>
      </fieldset>
      {step === "request" && <a className="recovery-code-link" href="/reset-password">Already have a reset code?</a>}
    </form>
  );
}
