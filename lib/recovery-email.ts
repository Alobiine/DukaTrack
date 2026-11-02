import { normalizeEmail } from "./email";

type EmailConfig = {
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  DUKATRACK_APP_URL?: string;
};

function settings(config: EmailConfig) {
  const sender = normalizeEmail(config.BREVO_SENDER_EMAIL);
  if (!config.BREVO_API_KEY?.trim() || !sender || !config.DUKATRACK_APP_URL) return null;
  try {
    const url = new URL(config.DUKATRACK_APP_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { sender, origin: url.origin, key: config.BREVO_API_KEY.trim() };
  } catch { return null; }
}

export const recoveryEmailConfigured = (config: EmailConfig) => settings(config) !== null;

export async function sendRecoveryEmail(config: EmailConfig, email: string, token: string) {
  const setup = settings(config);
  if (!setup || !normalizeEmail(email) || !/^[a-f0-9]{64}$/.test(token)) return false;
  // Use a configured origin, never the request's Host header. Fragments stay out of server logs.
  const link = `${setup.origin}/reset-password#token=${token}`;
  const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": setup.key, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        sender: { name: "DukaTrack", email: setup.sender },
        to: [{ email: normalizeEmail(email) }],
        subject: "Reset your DukaTrack password",
        textContent: `Reset your DukaTrack password\n\nOpen this link to choose a new password:\n${link}\n\nThis link expires in 15 minutes and can be used once.\n\nAlternatively, enter this reset code on the reset password page:\n${token}\n\nIf you did not request this, ignore this email. Your password has not changed.`,
        htmlContent: `<div style="font-family:Arial,sans-serif;color:#182e3c;max-width:520px;margin:auto;padding:24px"><h2>DukaTrack</h2><h1 style="font-size:24px">Reset your password</h1><p>Use the button below to choose a new password.</p><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#087a62;color:white;padding:14px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a></p><p>This link expires in 15 minutes and can be used once.</p><p>If the button does not work, open the reset password page and enter this code:</p><p style="word-break:break-all">${token}</p><p>If you did not request this, ignore this email. Your password has not changed.</p></div>`,
      }),
    });
    if (!response.ok) return false;
    const result = await response.json() as { messageId?: unknown };
    return typeof result.messageId === "string" && result.messageId.length > 0;
  } catch {
    // Never expose provider responses, API keys or recovery tokens to logs/browser errors.
    return false;
  }
}
