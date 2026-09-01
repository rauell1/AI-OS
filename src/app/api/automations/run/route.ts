import { NextRequest, NextResponse } from "next/server";
import { getDb, runAsSystem, runAsUser } from "@/lib/db";
import { runAllDue } from "@/app/actions/automations";
import { maskEmail, ownerEmail } from "@/lib/auth-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side automation trigger. Protected by CRON_SECRET.
// This route is exempt from the session middleware, so it must authenticate
// every request itself.
//
// Vercel Cron calls it with GET + `Authorization: Bearer $CRON_SECRET`.
// Manual/self-hosted callers can use either that or the x-cron-secret header:
//   curl -X POST https://ai-os.rauell.systems/api/automations/run -H "x-cron-secret: $CRON_SECRET"
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
  // The owner lookup runs before any user scope exists; the automation run
  // itself is then scoped to that owner so RLS applies normally.
  //
  // Looked up by OWNER_EMAIL rather than "the oldest row in users". The oldest
  // row is only the owner by accident: any second account created earlier - a
  // seed run, a migration, a test - silently redirects every automation onto
  // someone else's data.
  const email = ownerEmail();
  if (!email) {
    console.error("[rauell-os] Automations cannot run: OWNER_EMAIL is not set, so there is no account to run them for.");
    return NextResponse.json({ error: "OWNER_EMAIL is not configured" }, { status: 500 });
  }
  const owner = await runAsSystem(async () => {
    const db = await getDb();
    return db.get<{ id: string }>(`SELECT id FROM users WHERE email = ?`, [email]);
  });
  if (!owner) {
    console.error(`[rauell-os] Automations cannot run: no user row matches OWNER_EMAIL (${maskEmail(email)}).`);
    return NextResponse.json({ error: "No account matches OWNER_EMAIL" }, { status: 404 });
  }
  const result = await runAsUser(owner.id, () => runAllDue(owner.id));
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return trigger(req);
}

export async function POST(req: NextRequest) {
  return trigger(req);
}
