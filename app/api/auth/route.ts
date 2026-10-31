import { boundedJson } from "../../../lib/http";
import { env } from "cloudflare:workers";
import { empty } from "../../../lib/domain";
const hex = (a: ArrayBuffer) =>
  Array.from(new Uint8Array(a))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export const hash = async (s: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export async function password(p: string, s: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(p),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(s),
        iterations: 100000,
        hash: "SHA-256",
      },
      k,
      256,
    ),
  );
}
const json = (d: any, status = 200, headers: any = {}) =>
  Response.json(d, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export async function account(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|; )duka_session=([^;]+)/)?.[1];
  if (!token) return null;
  return await env
    .DB!.prepare(
      "SELECT a.id,a.business,a.owner,a.phone FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=? AND s.expires>?",
    )
    .bind(await hash(token), Date.now())
    .first();
}
export async function GET(request: Request) {
  return json({ account: await account(request) });
}
export async function POST(request: Request) {
  try {
    if (new URL(request.url).origin !== request.headers.get("origin"))
      return json({ error: "Request blocked." }, 403);
    const p: any = await boundedJson(request, 10000);
    const db = env.DB!;
    if (p.action === "logout") {
      const t = request.headers
        .get("cookie")
        ?.match(/(?:^|; )duka_session=([^;]+)/)?.[1];
      if (t) {
        const who = await account(request);
        await db.batch([
          ...(who ? [securityEvent(String(who.id), "logout")] : []),
          db.prepare("DELETE FROM sessions WHERE token=?").bind(await hash(t)),
        ]);
      }
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "duka_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      });
    }
    if (p.action === "change-password") {
      const current = await account(request);
      if (!current) return json({ error: "Sign in online first." }, 401);
      if (
        typeof p.currentPassword !== "string" ||
        p.currentPassword.length > 128 ||
        typeof p.newPassword !== "string" ||
        p.newPassword.length < 8 ||
        p.newPassword.length > 128
      )
        return json(
          {
            error:
              "Provide your current password and a new password of 8-128 characters.",
          },
          400,
        );
      const row: any = await db
        .prepare("SELECT * FROM accounts WHERE id=?")
        .bind(current.id)
        .first();
      if (row.locked_until > Date.now())
        return json(
          { error: "Account temporarily locked. Try again shortly." },
          429,
        );
      const digest = await password(p.currentPassword, row.salt);
      if (!equal(digest, row.password)) {
        await failed(row.id);
        return json({ error: "Incorrect current password." }, 401);
      }
      const salt = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            "UPDATE accounts SET password=?,salt=?,failures=0,locked_until=0 WHERE id=?",
          )
          .bind(await password(p.newPassword, salt), salt, row.id),
        db.prepare("DELETE FROM sessions WHERE account_id=?").bind(row.id),
        db
          .prepare("DELETE FROM recovery_tokens WHERE account_id=?")
          .bind(row.id),
        securityEvent(row.id, "password-change"),
      ]);
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "duka_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
      });
    }
    if (!["register", "login"].includes(p.action))
      return json({ error: "Unknown account action." }, 400);
    const phone = String(p.phone || "")
      .replace(/[\s+-]/g, "")
      .replace(/^0/, "256");
    if (
      !/^256\d{9}$/.test(phone) ||
      typeof p.password !== "string" ||
      p.password.length < 8 ||
      p.password.length > 128
    )
      return json(
        {
          error:
            "Use a Ugandan phone number and a password of 8–128 characters.",
        },
        400,
      );
    let a: any = await db
      .prepare("SELECT * FROM accounts WHERE phone=?")
      .bind(phone)
      .first();
    if (p.action === "register") {
      if (a)
        return json(
          { error: "This phone number is registered. Sign in instead." },
          409,
        );
      if (
        typeof p.business !== "string" ||
        !p.business.trim() ||
        p.business.length > 100 ||
        typeof p.owner !== "string" ||
        !p.owner.trim() ||
        p.owner.length > 100
      )
        return json({ error: "Enter your business and owner names." }, 400);
      const id = crypto.randomUUID(),
        salt = crypto.randomUUID(),
        digest = await password(p.password, salt);
      try {
        await db.batch([
          db
            .prepare(
              "INSERT INTO accounts(id,phone,owner,business,password,salt,created_at) VALUES(?,?,?,?,?,?,?)",
            )
            .bind(
              id,
              phone,
              p.owner.trim(),
              p.business.trim(),
              digest,
              salt,
              Date.now(),
            ),
          db
            .prepare(
              "INSERT INTO workspaces(account_id,version,data) VALUES(?,0,?)",
            )
            .bind(id, JSON.stringify(empty())),
          securityEvent(id, "register"),
        ]);
      } catch {
        return json(
          {
            error: "Could not register. This number may already be registered.",
          },
          409,
        );
      }
      a = { id, business: p.business.trim(), owner: p.owner.trim(), phone };
    } else {
      if (!a) {
        await password(p.password, "unregistered");
        return json({ error: "Incorrect phone number or password." }, 401);
      }
      if (a.locked_until > Date.now())
        return json(
          {
            error:
              "Account temporarily locked. Try again in " +
              Math.ceil((a.locked_until - Date.now()) / 1000) +
              " seconds.",
          },
          429,
        );
      const digest = await password(p.password, a.salt);
      let diff = digest.length ^ a.password.length;
      for (let i = 0; i < digest.length; i++)
        diff |= digest.charCodeAt(i) ^ a.password.charCodeAt(i);
      if (diff) {
        await failed(a.id);
        return json(
          {
            error:
              "Incorrect password. Three failed attempts lock the account for 30 seconds.",
          },
          401,
        );
      }
      await db
        .prepare("UPDATE accounts SET failures=0,locked_until=0 WHERE id=?")
        .bind(a.id)
        .run();
    }
    const token = crypto.randomUUID() + crypto.randomUUID();
    await db.batch([
      db
        .prepare("INSERT INTO sessions(token,account_id,expires) VALUES(?,?,?)")
        .bind(await hash(token), a.id, Date.now() + 7 * 86400000),
      securityEvent(a.id, "login"),
    ]);
    return json(
      {
        account: {
          id: a.id,
          business: a.business,
          owner: a.owner,
          phone: a.phone,
        },
      },
      200,
      {
        "Set-Cookie": `duka_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`,
      },
    );
  } catch {
    return json({ error: "Service unavailable. Please try again." }, 503);
  }
}

export function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function failed(id: string) {
  await env.DB!.batch([
    env
      .DB!.prepare(
        "UPDATE accounts SET failures=CASE WHEN failures>=2 THEN 0 ELSE failures+1 END, locked_until=CASE WHEN failures>=2 THEN ? ELSE 0 END WHERE id=?",
      )
      .bind(Date.now() + 30000, id),
    securityEvent(id, "failed-password"),
  ]);
}

function securityEvent(id: string, action: string) {
  return env
    .DB!.prepare(
      "INSERT INTO security_events(id,account_id,action,at) VALUES(?,?,?,?)",
    )
    .bind(crypto.randomUUID(), id, action, Date.now());
}
