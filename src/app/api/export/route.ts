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
  // Tables carrying user_id directly.
  const userScoped = [
    "profiles", "education", "employment", "skills", "projects",
    "organizations", "people", "links", "opportunities",
    "applications", "tasks", "emails", "documents", "references_", "leads", "notes", "goals",
    "chat_threads", "chat_messages", "chat_attachments", "knowledge_items",
    "automation_rules", "notifications", "approvals", "activity_events", "decisions",
    "integrations", "user_preferences",
  ];
  // Tables reached through a parent that carries user_id. These used to be
  // exported with a bare `SELECT * FROM <table>` in a catch block, which on the
  // Postgres backend row level security happened to scope anyway - but on the
  // SQLite backend, which has no RLS, dumped the table whole. Scoped explicitly
  // now rather than relying on a database feature the other backend lacks.
  const childScoped: Array<{ table: string; fk: string; parent: string }> = [
    { table: "skill_evidence", fk: "skill_id", parent: "skills" },
    { table: "opportunity_scores", fk: "opportunity_id", parent: "opportunities" },
    { table: "application_requirements", fk: "application_id", parent: "applications" },
    { table: "application_questions", fk: "application_id", parent: "applications" },
    { table: "application_versions", fk: "application_id", parent: "applications" },
  ];

  const dump: Record<string, any> = { exportedAt: new Date().toISOString(), userId: user.id, tables: {} };
  // Deliberately absent: `users` (holds the password hash) and
  // `integration_tokens` (holds encrypted OAuth tokens). An export is a file
  // that gets emailed and copied around; neither belongs in one.
  for (const table of userScoped) {
    dump.tables[table] = await db.query(`SELECT * FROM ${table} WHERE user_id = ?`, [user.id]);
  }
  for (const { table, fk, parent } of childScoped) {
    dump.tables[table] = await db.query(
      `SELECT c.* FROM ${table} c JOIN ${parent} p ON p.id = c.${fk} WHERE p.user_id = ?`,
      [user.id]
    );
  }

  const json = JSON.stringify(dump, null, 2);
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="rauell-os-export-${Date.now()}.json"`,
    },
  });
}
