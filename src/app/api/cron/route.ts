import { NextResponse } from "next/server";
import env from "@/lib/env";
import { runDueRules } from "@/lib/automations/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler tick. Bearer-authenticated with CRON_SECRET.
 * Executes every due automation rule (data-driven nextRunAt on AutomationRule),
 * so any scheduler (Vercel Cron, uptime pinger, GitHub Action) can drive it at
 * any frequency. Runs are idempotent and recorded in AutomationRun.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured; the scheduler endpoint is disabled." },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDueRules();
  return NextResponse.json({
    ok: true,
    ran: result.ran,
    results: result.results,
    at: new Date().toISOString(),
  });
}
