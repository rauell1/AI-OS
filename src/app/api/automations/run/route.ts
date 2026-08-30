import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runAllDue } from "@/app/actions/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side automation trigger. Protected by CRON_SECRET.
// Example: curl -X POST https://os.rauell.systems/api/automations/run -H "x-cron-secret: $CRON_SECRET"
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const owner = await db.get(`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`);
  if (!owner) return NextResponse.json({ error: "No user" }, { status: 404 });
  const result = await runAllDue(owner.id);
  return NextResponse.json(result);
}
