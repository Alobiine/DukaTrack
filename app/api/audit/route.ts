import { env } from "cloudflare:workers";
import { account } from "../auth/route";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const a = await account(request);
  if (!a)
    return Response.json(
      { error: "Sign in online to view the audit log." },
      { status: 401, headers },
    );
  try {
    const rows = await env
      .DB!.prepare(
        "SELECT e.id,e.at,e.action,e.payload,a.owner AS actor FROM audit_events e JOIN accounts a ON a.id=e.actor_id WHERE e.business_id=? ORDER BY e.at DESC,e.rowid DESC LIMIT 100",
      )
      .bind(a.id)
      .all();
    const security = await env
      .DB!.prepare(
        "SELECT e.id,e.at,e.action,'{}' AS payload,a.owner AS actor FROM security_events e JOIN accounts a ON a.id=e.account_id WHERE e.account_id=? ORDER BY e.at DESC LIMIT 100",
      )
      .bind(a.id)
      .all();
    const events = [...rows.results, ...security.results]
      .sort((x: any, y: any) => y.at - x.at)
      .slice(0, 100);
    return Response.json({ events }, { headers });
  } catch {
    return Response.json(
      { error: "Audit history is unavailable. Apply local migrations first." },
      { status: 503, headers },
    );
  }
}
