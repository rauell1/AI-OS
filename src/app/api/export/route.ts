import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Account export. The user is never trapped in the system.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const tables = [
    "profiles", "education", "employment", "skills", "skill_evidence", "projects",
    "organizations", "people", "links", "opportunities", "opportunity_scores",
    "applications", "application_requirements", "application_questions", "application_versions",
    "tasks", "emails", "documents", "references_", "leads", "notes", "goals",
    "chat_threads", "chat_messages", "chat_attachments", "knowledge_items",
    "automation_rules", "notifications", "approvals", "activity_events", "decisions",
    "integrations", "user_preferences",
  ];
  const dump: Record<string, any> = { exportedAt: new Date().toISOString(), userId: user.id, tables: {} };
  for (const t of tables) {
    try {
      dump.tables[t] = await db.query(`SELECT * FROM ${t} WHERE user_id = ?`, [user.id]);
    } catch {
      // Tables without a user_id column (e.g. opportunity_scores, sync_runs) are
      // linked via user-scoped parent rows; export them in full.
      dump.tables[t] = await db.query(`SELECT * FROM ${t}`);
    }
  }
  const json = JSON.stringify(dump, null, 2);
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="rauell-os-export-${Date.now()}.json"`,
    },
  });
}
