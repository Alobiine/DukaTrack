import { boundedJson } from "../../../lib/http";
import { readWorkspace, commitWorkspace } from "../../../db/workspace";
import { env } from "cloudflare:workers";
import { account } from "../auth/route";
import { applyCloud, type State, type Operation } from "../../../lib/domain";
export async function POST(request: Request) {
  const out = (v: any, status = 200) =>
    Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
  if (new URL(request.url).origin !== request.headers.get("origin"))
    return out({ error: "Request blocked." }, 403);
  const a = await account(request);
  if (!a)
    return out({ error: "Sign in online to synchronise your records." }, 401);
  try {
    const body: any = await boundedJson(request, 500000);
    if (body.businessId !== undefined && body.businessId !== a.id)
      return out(
        {
          error:
            "Signed-in business changed. Sign in to this workspace before syncing.",
        },
        409,
      );
    if (
      !Array.isArray(body.operations) ||
      body.operations.length > 100 ||
      JSON.stringify(body).length > 500000
    )
      return out({ error: "Sync batch too large." }, 400);
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await readWorkspace(env.DB!, String(a.id));
      let s: State = row.state;
      const accepted: string[] = [],
        rejected: any[] = [];
      for (const op of body.operations as Operation[]) {
        if (
          !op ||
          typeof op.id !== "string" ||
          !op.id.trim() ||
          op.id.length > 120
        )
          return out({ error: "Invalid operation identity." }, 400);
        s = applyCloud(s, op, String(a.id));
        const review = s.reviews.find((r) => r.id === op.id);
        if (review)
          rejected.push({
            id: op.id,
            message: review.message,
            operation: review.operation,
          });
        else accepted.push(op.id);
      }
      const committed = await commitWorkspace(
        env.DB!,
        { id: String(a.id), business: String(a.business) },
        s,
        row.version,
        body.operations,
        row.state,
      );
      if (committed)
        return out({
          state: s,
          accepted,
          rejected,
          version: row.version + 1,
          syncedAt: Date.now(),
        });
    }
    return out({ error: "Business records are busy. Try syncing again." }, 409);
  } catch {
    return out(
      { error: "Sync failed. Your device records are still saved." },
      503,
    );
  }
}
