import { boundedJson } from "../../../lib/http";
import { env } from "cloudflare:workers";
import { hash, password } from "../auth/route";
import { normalizeEmail } from "../../../lib/email";
import { recoveryEmailConfigured, sendRecoveryEmail } from "../../../lib/recovery-email";
export async function POST(request: Request) {
  const out = (d: object, status = 200) =>
    Response.json(d, { status, headers: { "Cache-Control": "no-store" } });
  if (new URL(request.url).origin !== request.headers.get("origin"))
    return out({ error: "Request blocked." }, 403);
  try {
    const p = (await boundedJson(request, 10000)) as {
      action?: string;
      email?: string;
      token?: string;
      newPassword?: string;
    };
    const db = env.DB!;
    if (p.action === "request") {
      if (!recoveryEmailConfigured(env) && !env.RECOVERY_EMAIL_DELIVERY)
        return out(
          {
            error:
              "Password recovery email is not configured yet. Contact your business administrator.",
          },
          503,
        );
      const email = normalizeEmail(p.email);
      if (!email)
        return out({ error: "Enter a valid email address." }, 400);
      const subject = await hash("recovery-email:" + email),
        now = Date.now();
      const gate = await db
        .prepare(
          "INSERT INTO recovery_limits(subject,requested_at) VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET requested_at=excluded.requested_at WHERE recovery_limits.requested_at<?",
        )
        .bind(subject, now, now - 300000)
        .run();
      if (!gate.meta.changes)
        return out(
          {
            error: "Wait five minutes before requesting another recovery link.",
          },
          429,
        );
      const a = await db
        .prepare("SELECT id FROM accounts WHERE email=?")
        .bind(email)
        .first<{ id: string }>();
      if (a) {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        await db
          .prepare(
            "INSERT INTO recovery_tokens(token_hash,account_id,expires,created_at) VALUES(?,?,?,?)",
          )
          .bind(await hash(token), a.id, now + 900000, now)
          .run();
        const response = recoveryEmailConfigured(env)
          ? { ok: await sendRecoveryEmail(env, email, token) }
          : await env.RECOVERY_EMAIL_DELIVERY!.fetch(
          "https://recovery.internal/deliver",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, token, expiresAt: now + 900000 }),
          },
        );
        if (!response.ok) {
          await db
            .prepare("DELETE FROM recovery_tokens WHERE token_hash=?")
            .bind(await hash(token))
            .run();
          return out(
            { error: "Recovery delivery is unavailable. Try again later." },
            503,
          );
        }
      }
      return out({
        ok: true,
        message:
          "If this account exists, a recovery email has been sent. Check your inbox and spam folder.",
      });
    }
    if (
      p.action !== "reset" ||
      typeof p.token !== "string" ||
      !/^([a-f0-9]{64})$/.test(p.token) ||
      typeof p.newPassword !== "string" ||
      p.newPassword.length < 8 ||
      p.newPassword.length > 128
    )
      return out(
        {
          error:
            "Enter a valid recovery token and password of 8-128 characters.",
        },
        400,
      );
    const tokenHash = await hash(p.token),
      now = Date.now();
    const valid = await db
      .prepare(
        "SELECT account_id FROM recovery_tokens WHERE token_hash=? AND expires>?",
      )
      .bind(tokenHash, now)
      .first();
    if (!valid)
      return out(
        { error: "Recovery token is invalid, expired or already used." },
        400,
      );
    const salt = crypto.randomUUID(),
      digest = await password(p.newPassword, salt);
    // D1 batch is transactional. Conditional update ensures an expired/used token does nothing.
    const results = await db.batch([
      db
        .prepare(
          "DELETE FROM sessions WHERE account_id IN (SELECT account_id FROM recovery_tokens WHERE token_hash=? AND expires>?)",
        )
        .bind(tokenHash, now),
      db
        .prepare(
          "UPDATE accounts SET password=?,salt=?,failures=0,locked_until=0 WHERE id IN (SELECT account_id FROM recovery_tokens WHERE token_hash=? AND expires>?)",
        )
        .bind(digest, salt, tokenHash, now),
      db
        .prepare(
          "INSERT INTO security_events(id,account_id,action,at) SELECT ?,account_id,'password-recovery',? FROM recovery_tokens WHERE token_hash=? AND expires>?",
        )
        .bind(crypto.randomUUID(), Date.now(), tokenHash, now),
      db
        .prepare(
          "DELETE FROM recovery_tokens WHERE account_id IN (SELECT account_id FROM recovery_tokens WHERE token_hash=? AND expires>?)",
        )
        .bind(tokenHash, now),
    ]);
    return results[1].meta.changes
      ? out({ ok: true })
      : out(
          { error: "Recovery token is invalid, expired or already used." },
          400,
        );
  } catch {
    return out({ error: "Recovery service unavailable." }, 503);
  }
}
