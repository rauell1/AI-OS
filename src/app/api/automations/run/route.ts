import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runAllDue } from "@/app/actions/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side automation trigger. Protected by CRON_SECRET.
// This route is exempt from the session middleware, so it must authenticate
// every request itself.
//
// Vercel Cron calls it with GET + `Authorization: Bearer $CRON_SECRET`.
// Manual/self-hosted callers can use either that or the x-cron-secret header:
//   curl -X POST https://os.rauell.systems/api/automations/run -H "x-cron-secret: $CRON_SECRET"
function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // Without a configured secret the endpoint stays closed rather than open.
  if (!expected) return false;
  if (req.headers.get("x-cron-secret") === expected) return true;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

async function trigger(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const owner = await db.get<{ id: string }>(
    `SELECT id FROM users ORDER BY created_at ASC LIMIT 1`
  );
  if (!owner) return NextResponse.json({ error: "No user" }, { status: 404 });
  const result = await runAllDue(owner.id);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return trigger(req);
}

export async function POST(req: NextRequest) {
  return trigger(req);
}
